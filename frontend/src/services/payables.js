import {moneyUnits,moneyText,decimalMoney} from './decimalMoney';
export const paymentMethods={'01':'Dinheiro','02':'Cheque','03':'Cartão de crédito','04':'Cartão de débito','05':'Crédito loja','15':'Boleto bancário','16':'Depósito bancário','17':'Pix','18':'Transferência bancária','90':'Sem pagamento','99':'Outros'};
export function cents(value){
 const s=String(value??'');
 if(!/^\d+(\.\d{1,2})?$/.test(s))throw new Error('Informe um valor com até duas casas decimais.');
 const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n)||n>99999999999999)throw new Error('Valor fora do limite.');return n;
}
export function validDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value??''))return false;
 const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function installmentPlan(total,count,firstDate){
 const units=moneyUnits(total),n=Number(count);
 if(!Number.isInteger(n)||n<1||n>120)throw new Error('Informe entre 1 e 120 parcelas.');
 const quantum=units%10000n===0n&&units/10000n>=BigInt(n)?10000n:1n,amount=units/quantum;
 if(!Number.isInteger(n)||n<1||n>120||amount<BigInt(n)||!validDate(firstDate))throw new Error('Confira o total, o número de parcelas (1 a 120) e o primeiro vencimento.');
 const [year,month,day]=firstDate.split('-').map(Number);
 return Array.from({length:n},(_,index)=>{
  const end=new Date(Date.UTC(year,month-1+index+1,0));
  const date=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),Math.min(day,end.getUTCDate()))).toISOString().slice(0,10);
  return {numero:String(index+1),vencimento:date,valor:moneyText((amount/BigInt(n)+(BigInt(index)<amount%BigInt(n)?1n:0n))*quantum),formaPagamento:''};
 });
}
export function payablePayload(form){
 const total=moneyUnits(form.total);
 if(!String(form.fornecedorNome??'').trim()||!String(form.descricao??'').trim()||total<=0)throw new Error('Informe fornecedor, descrição e total maior que zero.');
 if(!Array.isArray(form.parcelas)||!form.parcelas.length||form.parcelas.length>120)throw new Error('Informe entre 1 e 120 parcelas.');
 const parcelas=form.parcelas.map((p,i)=>{
  if(!validDate(p.vencimento)||moneyUnits(p.valor)<=0)throw new Error('Confira os vencimentos e valores das parcelas.');
  return {numero:i+1,referencia:String(p.numero??i+1),vencimento:p.vencimento,valor:decimalMoney(p.valor),forma_pagamento:String(p.formaPagamento??'').trim()};
 });
 if(form.parcelas.reduce((sum,p)=>sum+moneyUnits(p.valor),0n)!==total)throw new Error('A soma das parcelas deve ser igual ao total do lançamento.');
 return {fornecedor_id:form.fornecedorId||null,fornecedor_nome:form.fornecedorNome.trim(),fornecedor_documento:form.fornecedorDocumento??'',descricao:form.descricao.trim(),total:decimalMoney(form.total),observacoes:form.observacoes??'',parcelas,...(form.categoriaId!==undefined?{categoria_id:form.categoriaId||null}:{})};
}
export function payableFromRow(row,lines=[]){return {id:row.id,sourceId:row.stock_movement_id,categoriaId:row.categoria_id??'',fornecedorId:row.fornecedor_id??'',fornecedorNome:row.fornecedor_nome,fornecedorDocumento:row.fornecedor_documento,descricao:row.descricao,total:String(row.total),observacoes:row.observacoes,parcelas:lines.filter(p=>p.payable_id===row.id).sort((a,b)=>a.numero-b.numero).map(p=>({id:p.id,numero:p.referencia,vencimento:p.vencimento,valor:moneyText(moneyUnits(p.valor)),formaPagamento:p.forma_pagamento}))};}
