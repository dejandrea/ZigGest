import {invoiceAdjustmentFields} from './invoiceTotals';
import {stockQuantity} from './dataMapping';
function invoiceQuantity(value){const text=String(value??'').trim().replace(',','.');if(!/^\d+(\.\d{1,4})?$/.test(text)||Number(text)<=0||Number(text)>999999999999.999)throw new Error('Quantidade na nota inv\u00e1lida. Use at\u00e9 quatro casas decimais.');return Number(text);}
function required(value,label,max=200){const text=String(value??'').trim();if(!text||text.length>max)throw new Error('Informe '+label+'.');return text;}
function amount(value,label,precision=2){const text=String(value??'').trim().replace(',','.');if(!new RegExp('^\\d+(\\.\\d{1,'+precision+'})?$').test(text)||Number(text)>999999999999.99)throw new Error(label+' inv\u00e1lido. Use at\u00e9 '+precision+' casas decimais.');return Number(text);}
function date(value,label){const d=new Date(value);if(!value||!Number.isFinite(d.getTime())||d.getTime()>Date.now())throw new Error(label+' inválida ou futura.');return d.toISOString();}
export function manualInvoicePayload(body,{editing=false}={}){
 const h=body.header??{},document=String(h.issuerDocument??'').replace(/\D/g,'');
 if(!/^(\d{11}|\d{14})$/.test(document))throw new Error('Informe o CPF / CNPJ do fornecedor.');
 if(!/^\d{1,9}$/.test(h.number)||Number(h.number)<1||!/^\d{1,3}$/.test(h.series))throw new Error('Informe número e série válidos da nota.');
 if(!Array.isArray(body.lines)||!body.lines.length||body.lines.length>990)throw new Error('Adicione entre 1 e 990 itens à nota.');
 const header={numero:String(Number(h.number)),serie:String(Number(h.series)),emitente_nome:required(h.issuerName,'o fornecedor'),emitente_documento:document,emitida_em:date(h.issuedAt,'Data de emissão'),total:amount(h.total,'Total da nota'),destinatario_nome:String(h.recipientName??'').trim(),destinatario_documento:String(h.recipientDocument??'').replace(/\D/g,'')};
 for(const [key,label] of invoiceAdjustmentFields)header[key]=amount(h[key]??'0',label);
 if(header.destinatario_nome.length>200||header.destinatario_documento&&!/^(\d{11}|\d{14})$/.test(header.destinatario_documento))throw new Error('Dados do destinatário inválidos.');
 const lines=body.lines.map((l,index)=>{
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(l.stockItemId))throw new Error('Vincule todos os itens a insumos.');
  const quantity=stockQuantity(l.quantity),factor=stockQuantity(l.factor),delta=quantity*factor;
  if(delta>999999999999999.999||Math.abs(delta*1000-Math.round(delta*1000))>0.00001)throw new Error('Conversão fora da precisão suportada.');
  return {n_item:index+1,codigo:String(l.code??'').trim(),descricao:required(l.name,'a descrição do item'),unidade:required(l.unit,'a unidade da nota',10),quantidade_nf:editing?invoiceQuantity(l.invoiceQuantity):stockQuantity(l.invoiceQuantity),valor_unitario:amount(l.unitPrice,'Valor unitário',editing?10:2),valor_total:amount(l.total,'Total do item'),stock_item_id:l.stockItemId,quantidade:quantity,fator:factor};
 });
 return {p_request:body.requestId,p_header:header,p_lines:lines,p_ocorrido_em:body.dataEntrada?date(body.dataEntrada,'Data de entrada'):null,p_observacoes:String(body.observacoes??'').trim()};
}
