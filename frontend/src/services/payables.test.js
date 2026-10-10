import {expect,it} from 'vitest';
import {installmentPlan,payablePayload,validDate} from './payables';
import {parseNfe} from './nfe';
import {nfeXml} from '../testFixtures/nfe';
it('splits cents exactly and handles short months without drifting',()=>{
 const plan=installmentPlan('100.00',3,'2026-01-31');
 expect(plan.map(p=>p.valor)).toEqual(['33.34','33.33','33.33']);
 expect(plan.map(p=>p.vencimento)).toEqual(['2026-01-31','2026-02-28','2026-03-31']);
 expect(installmentPlan('10',2,'2028-01-31')[1].vencimento).toBe('2028-02-29');
});
it('rejects impossible dates, zero installments and fractional cents',()=>{
 expect(validDate('2026-02-30')).toBe(false);
 expect(()=>installmentPlan('0.01',2,'2026-01-01')).toThrow();
 expect(()=>installmentPlan('1.001',1,'2026-01-01')).toThrow();
 expect(()=>installmentPlan('10',121,'2026-01-01')).toThrow();
});
it('requires the edited installments to match the edited total',()=>{
 const form={fornecedorNome:'Fornecedor',descricao:'Compra',total:'100',parcelas:installmentPlan('100',3,'2026-01-01')};
 expect(payablePayload(form).parcelas[0]).toMatchObject({numero:1,valor:33.34,vencimento:'2026-01-01'});
 expect(()=>payablePayload({...form,total:'101'})).toThrow('soma');
});
it('imports duplicate numbers, due dates and payment details from NF-e',()=>{
 const xml=nfeXml().replace('</infNFe>','<cobr><fat><vLiq>96.00</vLiq></fat><dup><nDup>001</nDup><dVenc>2026-02-01</dVenc><vDup>48.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-03-01</dVenc><vDup>48.00</vDup></dup></cobr><pag><detPag><indPag>1</indPag><tPag>15</tPag><vPag>96.00</vPag></detPag></pag></infNFe>');
 const invoice=parseNfe(xml);
 expect(invoice.duplicates).toEqual([{numero:'001',vencimento:'2026-02-01',valor:'48.00'},{numero:'002',vencimento:'2026-03-01',valor:'48.00'}]);
 expect(invoice.payments[0]).toMatchObject({code:'15',indicator:'1',amount:'96.00'});
 expect(parseNfe(nfeXml()).duplicates).toEqual([]);
});
