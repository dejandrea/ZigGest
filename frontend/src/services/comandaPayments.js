import {cents} from './payables';
export function remainingBalance(c){return Math.max(0,Math.round(Number(c.total_geral)*100)-Math.round(Number(c.paid_total??0)*100))/100;}
export function splitBalance(total,people){
 const count=Number(people),amount=cents(total);
 if(!Number.isSafeInteger(count)||count<1||count>100)throw new Error('Informe de 1 a 100 pessoas para ratear.');
 const base=Math.floor(amount/count),extra=amount%count;
 return Array.from({length:count},(_,i)=>(base+(i<extra?1:0))/100);
}
export function selectedItems(c,quantities){return c.itens.flatMap(line=>{
 const qty=Number(quantities[line.id]??0);
 if(!Number.isSafeInteger(qty)||qty<0||qty>line.quantidade-Number(line.quantidade_paga??0))throw new Error('Confira as quantidades dos itens ainda não pagos.');
 return qty?[{item_id:line.id,quantidade:qty}]:[];
});}
export function itemPaymentTotal(c,quantities){return selectedItems(c,quantities).reduce((sum,item)=>sum+Math.round(Number(c.itens.find(line=>line.id===item.item_id).valor_unitario)*100)*item.quantidade,0)/100;}
