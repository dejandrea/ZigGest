import {it,expect} from 'vitest';
import {manualInvoicePayload} from './manualInvoice';
const body={requestId:'r',header:{number:'00123',series:'001',issuerName:'Fornecedor',issuerDocument:'12.345.678/0001-95',issuedAt:'2026-01-01T10:00:00-03:00',total:'96'},lines:[{name:'Cola',unit:'PCT',invoiceQuantity:2,unitPrice:48,total:96,stockItemId:'11111111-1111-1111-1111-111111111111',quantity:2,factor:12}]};
it('normalizes manual note identity and only sends allowed fields',()=>{
 const payload=manualInvoicePayload({...body,saldo:999});
 expect(payload.p_header).toMatchObject({numero:'123',serie:'1',emitente_documento:'12345678000195'});
 expect(payload.p_lines[0]).toMatchObject({quantidade_nf:2,quantidade:2,fator:12});
 expect(payload).not.toHaveProperty('saldo');
});
it('sends all adjustment fields and rejects negative values',()=>{
 expect(manualInvoicePayload({...body,header:{...body.header,frete:'10',descontos:'3',impostos:'4',acrescimos:'2'}}).p_header).toMatchObject({frete:10,descontos:3,impostos:4,acrescimos:2});
 expect(()=>manualInvoicePayload({...body,header:{...body.header,descontos:'-1'}})).toThrow();
});
it('rejects missing headers, invalid quantities and future dates',()=>{
 expect(()=>manualInvoicePayload({...body,header:{...body.header,number:''}})).toThrow();
 expect(()=>manualInvoicePayload({...body,header:{...body.header,issuedAt:'2999-01-01'}})).toThrow();
 expect(()=>manualInvoicePayload({...body,lines:[]})).toThrow();
 expect(()=>manualInvoicePayload({...body,lines:[{...body.lines[0],quantity:0.001,factor:0.001}]})).toThrow('precisão');
});
it('preserves NF-e quantity and unit price precision when editing an imported entry',()=>{
 const edited={...body,lines:[{...body.lines[0],invoiceQuantity:'2.1234',unitPrice:'45.1234567890'}]};
 const payload=manualInvoicePayload(edited,{editing:true});
 expect(payload.p_lines[0]).toMatchObject({quantidade_nf:2.1234,valor_unitario:45.123456789});
 expect(()=>manualInvoicePayload(edited)).toThrow();
});
