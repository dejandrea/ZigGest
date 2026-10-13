import {it,expect} from 'vitest';
import {moneyUnits,moneyText,sumMoney,multiplyMoney} from './decimalMoney';
import {productToRow,ledgerToRow} from './dataMapping';
import {installmentPlan,payablePayload,cents} from './payables';
import {invoiceTotals} from './invoiceTotals';
import {financePayload,settledAmount} from './finance';
it('keeps millionths through arithmetic and rejects a seventh decimal',()=>{
 expect(moneyText(moneyUnits('1,234567'))).toBe('1.234567');
 expect(sumMoney(['0.000001','0.000002','-0.000001'])).toBe(0.000002);
 expect(multiplyMoney('3','0.123456')).toBe('0.370368');
 expect(()=>moneyUnits('1.2345678')).toThrow('seis');
});
it('accepts precise costs and ledger amounts while restricting sale prices to cents',()=>{
 expect(productToRow({custo:'1.123456',precoVenda:'2.34'})).toMatchObject({custo:1.123456,preco_venda:2.34});
 expect(ledgerToRow({valor:'1.123456'}).amount).toBe(1.123456);
 expect(()=>productToRow({precoVenda:'2.345'})).toThrow();
 expect(()=>productToRow({custo:'1.1234567'})).toThrow();
 expect(()=>cents('2.345')).toThrow();
});
it('splits precise payable totals without losing the remainder',()=>{
 const parcelas=installmentPlan('1.000001',3,'2026-01-01');
 expect(parcelas.map(p=>p.valor)).toEqual(['0.333334','0.333334','0.333333']);
 expect(installmentPlan('0.01',2,'2026-01-01').map(p=>p.valor)).toEqual(['0.005','0.005']);
 expect(payablePayload({fornecedorNome:'Fornecedor',descricao:'Compra',total:'1.000001',parcelas}).total).toBe(1.000001);
 expect(invoiceTotals('1.000001',[{total:'0.333334'},{total:'0.333334'},{total:'0.333333'}]).matches).toBe(true);
});
it('settles partial amounts without rounding the outstanding millionths',()=>{
 const form={tipo:'PAYMENT',valor:'0.000001',data:'2026-01-01',descricao:'Baixa',contaId:'a',formaId:'p',parcelaId:'i'};
 expect(financePayload(form).valor).toBe(0.000001);
 expect(settledAmount([{id:'1',tipo:'PAYMENT',parcela_id:'i',valor:'0.000001'},{id:'2',tipo:'PAYMENT',parcela_id:'i',valor:'0.000002'}],'parcela_id','i')).toBe(0.000003);
});
