import {expect,it} from 'vitest';
import {financePayload,settledAmount,activeOperations,today} from './finance';
it('calculates partial settlements excluding reversed operations',()=>{
 const ops=[{id:'a',tipo:'PAYMENT',parcela_id:'p',valor:30},{id:'b',tipo:'PAYMENT',parcela_id:'p',valor:20},{id:'r',tipo:'REVERSAL',estorno_de:'a',parcela_id:'p',valor:30}];
 expect(settledAmount(ops,'parcela_id','p')).toBe(20);
 expect(activeOperations(ops).map(o=>o.id)).toEqual(['b']);
});
it('requires account, payment method and exact cents for settlements',()=>{
 const base={tipo:'PAYMENT',valor:'10.25',data:today(),descricao:'Pagamento',contaId:'cash',formaId:'pix',parcelaId:'p'};
 expect(financePayload(base)).toMatchObject({valor:10.25,conta_id:'cash',forma_id:'pix',parcela_id:'p'});
 expect(()=>financePayload({...base,formaId:''})).toThrow('forma');
 expect(()=>financePayload({...base,valor:'10.2550001'})).toThrow('casas');
 expect(()=>financePayload({...base,data:'2999-01-01'})).toThrow('data');
});
it('keeps transfer and credit allocation separate from cash receipt',()=>{
 expect(()=>financePayload({tipo:'TRANSFER',valor:'10',data:today(),descricao:'Transferência',contaId:'a',destinoId:'a'})).toThrow('diferentes');
 const data=financePayload({tipo:'ALLOCATION',valor:'20',data:today(),descricao:'Crédito',debitoId:'d',creditoId:'c'});
 expect(data).toMatchObject({conta_id:null,forma_id:null,debito_id:'d',credito_id:'c'});
});
it('requires a reason for reversal and sends no editable replacement amount',()=>{
 const base={tipo:'REVERSAL',data:today(),descricao:'Estorno',estornoDe:'original',motivo:'Correção',valor:'999'};
 expect(financePayload(base)).toEqual({tipo:'REVERSAL',data:today(),descricao:'Estorno',estorno_de:'original',motivo:'Correção'});
 expect(()=>financePayload({...base,motivo:''})).toThrow('motivo');
});
it('settles a canceled sale debt without counting it as a new receipt',()=>{
 const ops=[{id:'void',tipo:'SALE_VOID',debito_id:'debt',valor:30}];
 expect(settledAmount(ops,'debito_id','debt')).toBe(30);
 expect(()=>financePayload({tipo:'SALE_VOID',valor:30,data:today(),descricao:'Forjado'})).toThrow('tipo');
});
