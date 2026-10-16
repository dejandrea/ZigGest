import { describe, expect, it } from 'vitest';
import { receivablesFromRows } from '../../services/receivables';

describe('receivable balances', () => {
  it('handles partial receipts, allocations, reversals and locked history with exact decimals', () => {
    const rows = [
      {id:'debit',codigo_conta:1,customer_codigo:7,entry_type:'DEBIT',amount:'1'},
      {id:'credit',codigo_conta:2,customer_codigo:7,entry_type:'CREDIT',amount:'0.5'},
      {id:'reversed',codigo_conta:3,customer_codigo:8,entry_type:'DEBIT',amount:'2'},
    ];
    const operations = [
      {id:'receipt',tipo:'RECEIPT',debito_id:'debit',valor:'0.1'},
      {id:'allocation',tipo:'ALLOCATION',debito_id:'debit',credito_id:'credit',valor:'0.2'},
      {id:'old',tipo:'RECEIPT',debito_id:'reversed',valor:'1'},
      {id:'undo',tipo:'REVERSAL',estorno_de:'old',valor:'1'},
      {id:'other',tipo:'INCOME',debito_id:'debit',valor:'9'},
    ];
    const result = receivablesFromRows(rows, [{codigo_cliente:7,nome:'Cliente',total_pendente:'0.7'}], operations);
    expect(result[0]).toMatchObject({clienteNome:'Cliente',baixado:0.3,aberto:0.7,saldoCliente:0.7,locked:true});
    expect(result[1]).toMatchObject({baixado:0.2,aberto:0.3,locked:true});
    expect(result[2]).toMatchObject({clienteNome:'Cliente não encontrado',baixado:0,aberto:2,locked:true});
  });
});
