import {money} from './finance';
const quantity=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const date=value=>String(value??'').split('-').reverse().join('/');
export function notificationPresentation(alert){
 const d=alert.details;
 switch(alert.kind){
  case 'LOW_STOCK':return {title:d.name,description:`Estoque mínimo atingido: saldo ${quantity.format(Number(d.balance))} ${d.unit} · mínimo ${quantity.format(Number(d.minimum))} ${d.unit}.`,path:'/compras?insumo='+encodeURIComponent(d.stockItemId),action:'Ver na lista de compras'};
  case 'CASH_OPEN_24H':return {title:'Caixa aberto há mais de 24 horas',description:'Abertura: '+new Date(d.openedAt).toLocaleString('pt-BR',{timeZone:'America/Bahia'})+'. Confira as comandas pendentes e o fechamento.',path:'/caixa',action:'Ver caixa'};
  case 'PAYABLE_OVERDUE':case 'PAYABLE_DUE_SOON':return {title:(alert.kind==='PAYABLE_OVERDUE'?'Conta a pagar vencida: ':'Conta a pagar próxima do vencimento: ')+d.supplier,description:`${d.description} · parcela ${d.reference} · vencimento ${date(d.dueDate)} · em aberto ${money(d.balance)}.`,path:'/contas-pagar',action:'Ver contas a pagar'};
  case 'RECEIVABLE_OVERDUE':return {title:'Conta a receber vencida: '+d.customer,description:`Lançamento #${d.entryCode} · vencimento ${date(d.dueDate)} · em aberto ${money(d.balance)}.`,path:'/contas',action:'Ver contas a receber'};
  case 'CUSTOMER_OVER_LIMIT':return {title:'Limite ultrapassado: '+d.customer,description:`Saldo ${money(d.balance)} · limite ${money(d.limit)} · excedente ${money(d.excess)}.`,path:'/clientes',action:'Ver clientes'};
  default:return {title:'Notificação do sistema',description:'Confira as pendências do estabelecimento.',path:'/',action:'Ver visão geral'};
 }
}
