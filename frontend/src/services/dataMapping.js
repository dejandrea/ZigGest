export function customerFromRow(row) {
  return {
    _id: row.id, codigoCliente: row.codigo_cliente, nome: row.nome,
    apelido: row.apelido ?? '', telefone: row.telefone ?? '', email: row.email ?? '',
    endereco: row.endereco ?? '', ativo: row.ativo, status: row.status,
    limite: Number(row.limite ?? 0), totalPendente: Number(row.total_pendente ?? 0),
    observacoes: row.observacoes ?? '', createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function boolean(value) { return value === true || value === 'true'; }
export function customerToRow(body) {
  const result = {};
  for (const key of ['nome','apelido','telefone','email','endereco','status','observacoes']) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  if (body.ativo !== undefined) result.ativo = boolean(body.ativo);
  if (body.limite !== undefined) {
    result.limite = Number(body.limite);
    if (!Number.isFinite(result.limite) || result.limite < 0) throw new Error('Limite inválido.');
  }
  return result;
}
export function ledgerFromRow(row, customers = []) {
  return {
    _id: row.id, codigoConta: row.codigo_conta, codigoCliente: row.customer_codigo,
    clienteNome: customers.find(c => c.codigo_cliente === row.customer_codigo)?.nome ?? 'Cliente não encontrado',
    valor: Number(row.amount), tipo: row.entry_type === 'CREDIT' ? 'credito' : 'debito',
    dataLancamento: row.issue_at, dataVencimento: row.due_at,
    observacoes: row.notes ?? '', createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function ledgerToRow(body) {
  const result = {};
  if (body.codigoCliente !== undefined) result.customer_codigo = Number(body.codigoCliente);
  if (body.tipo !== undefined) {
    if (!['debito','credito'].includes(body.tipo)) throw new Error('Tipo de lançamento inválido.');
    result.entry_type = body.tipo === 'credito' ? 'CREDIT' : 'DEBIT';
  }
  if (body.valor !== undefined) {
    result.amount = Number(body.valor);
    if (!Number.isFinite(result.amount) || result.amount < 0) throw new Error('Valor inválido.');
  }
  if (body.dataLancamento) result.issue_at = body.dataLancamento;
  if (body.dataVencimento) result.due_at = /^\d{4}-\d{2}-\d{2}$/.test(body.dataVencimento) ? body.dataVencimento + 'T12:00:00-03:00' : body.dataVencimento;
  if (body.observacoes !== undefined) result.notes = body.observacoes;
  return result;
}
export function mesaFromRow(row) {
  return { _id: row.id, codigoMesa: row.codigo_mesa, nomeCliente: row.nome_cliente ?? '',
    status: row.status, totalGeral: Number(row.total_geral), dataCriacao: row.created_at };
}
export function itemFromRow(row) {
  return { _id: row.id, codigoMesa: row.codigo_mesa, descricao: row.descricao,
    valorUnitario: Number(row.valor_unitario), quantidade: row.quantidade, total: Number(row.total) };
}
