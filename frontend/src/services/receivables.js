import { activeOperations } from './finance';
import { moneyUnits, moneyText, subtractMoney } from './decimalMoney';
import { ledgerFromRow } from './dataMapping';

// Index the history once, preserving exact monetary arithmetic and reversal rules.
export function receivablesFromRows(rows, customers, operations) {
  const customerIndex = new Map(customers.map(customer => [customer.codigo_cliente, customer]));
  const locked = new Set();
  const debits = new Map(), credits = new Map();
  for (const operation of operations) {
    if (operation.debito_id) locked.add(operation.debito_id);
    if (operation.credito_id) locked.add(operation.credito_id);
  }
  for (const operation of activeOperations(operations)) {
    if (!['PAYMENT', 'RECEIPT', 'ALLOCATION', 'SALE_VOID'].includes(operation.tipo)) continue;
    for (const [field, index] of [['debito_id', debits], ['credito_id', credits]]) {
      const id = operation[field];
      if (id) index.set(id, (index.get(id) ?? 0n) + moneyUnits(operation.valor, true));
    }
  }
  return rows.map(row => {
    const customer = customerIndex.get(row.customer_codigo);
    const index = row.entry_type === 'DEBIT' ? debits : credits;
    const settled = Number(moneyText(index.get(row.id) ?? 0n));
    return {
      ...ledgerFromRow(row), clienteNome: customer?.nome ?? 'Cliente não encontrado',
      clienteApelido: customer?.apelido ?? '',
      categoriaId: row.categoria_id ?? '', financeOperationId: row.financial_operation_id,
      locked: !!row.financial_operation_id || locked.has(row.id),
      baixado: settled, aberto: Math.max(0, subtractMoney(row.amount, settled)),
      saldoCliente: Number(customer?.total_pendente ?? 0),
    };
  });
}
