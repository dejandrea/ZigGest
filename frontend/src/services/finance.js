import {cents,validDate} from './payables';
export const accountTypes={CASH:'Dinheiro / caixa',BANK:'Conta bancária',CARD:'Valores de cartões',WALLET:'Carteira digital'};
export const methodTypes={CASH:'Dinheiro',PIX:'Pix',CREDIT_CARD:'Cartão de crédito',DEBIT_CARD:'Cartão de débito',TRANSFER:'Transferência',BOLETO:'Boleto',DEFERRED:'A prazo',OTHER:'Outros'};
export const operationTypes={PAYMENT:'Pagamento',RECEIPT:'Recebimento',TRANSFER:'Transferência',INCOME:'Entrada avulsa',EXPENSE:'Saída avulsa',OPENING:'Saldo inicial',ALLOCATION:'Vínculo de crédito',REVERSAL:'Estorno',SALE_VOID:'Anulação de venda'};
export const bankMethodTypes=['PIX','CREDIT_CARD','DEBIT_CARD','BOLETO'];
export function receivingAccount(method,accounts=[]){return method?.conta_padrao_id||(bankMethodTypes.includes(method?.tipo)?accounts.find(a=>a.banco_inicial)?.id:'')||'';}
export const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'});
export const money=value=>Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export function activeOperations(operations=[]){const reversed=new Set(operations.map(o=>o.estorno_de).filter(Boolean));return operations.filter(o=>o.tipo!=='REVERSAL'&&!reversed.has(o.id));}
export function settledAmount(operations,field,id){return activeOperations(operations).filter(o=>o[field]===id&&['PAYMENT','RECEIPT','ALLOCATION','SALE_VOID'].includes(o.tipo)).reduce((sum,o)=>sum+Math.round(Number(o.valor)*100),0)/100;}
export function financePayload(form){
 if(!operationTypes[form.tipo]||['OPENING','SALE_VOID'].includes(form.tipo)||!validDate(form.data)||form.data>today()||!String(form.descricao??'').trim())throw new Error('Confira tipo, descrição e data (atual ou passada).');
 const base={tipo:form.tipo,data:form.data,descricao:form.descricao.trim(),motivo:form.motivo??''};
 if(form.tipo==='REVERSAL'){
  if(!form.estornoDe||base.motivo.trim().length<3)throw new Error('Informe o motivo do estorno.');
  return {...base,estorno_de:form.estornoDe};
 }
 const valor=cents(form.valor)/100;if(valor<=0)throw new Error('Informe um valor maior que zero.');
 const payload={...base,valor,conta_id:form.contaId||null,destino_id:form.destinoId||null,categoria_id:form.categoriaId||null,forma_id:form.formaId||null,parcela_id:form.parcelaId||null,debito_id:form.debitoId||null,credito_id:form.creditoId||null};
 if(form.tipo==='ALLOCATION'){
  if(!payload.debito_id||!payload.credito_id)throw new Error('Selecione o crédito deste cliente.');
 }else{
  if(!payload.conta_id)throw new Error('Selecione a conta financeira.');
  if(form.tipo==='TRANSFER'){
   if(!payload.destino_id||payload.destino_id===payload.conta_id)throw new Error('Selecione duas contas diferentes.');
  }else if(!payload.forma_id)throw new Error('Selecione a forma de pagamento.');
  if(['INCOME','EXPENSE'].includes(form.tipo)&&!payload.categoria_id)throw new Error('Selecione a categoria.');
 }
 return payload;
}
