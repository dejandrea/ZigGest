function cents(value){
 const text=String(value??'').trim().replace(',','.');
 if(!/^\d+(\.\d{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.split('.');
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
function amount(value){const absolute=value<0n?-value:value;return (value<0n?'-':'')+(absolute/100n)+'.'+String(absolute%100n).padStart(2,'0');}
export const invoiceAdjustmentFields=[['frete','Frete'],['descontos','Descontos'],['impostos','Impostos'],['acrescimos','Acréscimos']];
export function invoiceTotals(total,items,adjustments={}){
 const values=items.map(item=>cents(item.total));
 const sum=values.length&&values.every(value=>value!==null)?values.reduce((result,value)=>result+value,0n):null;
 const fees=invoiceAdjustmentFields.map(([key])=>cents(adjustments[key]??'0'));
 const calculated=sum!==null&&fees.every(value=>value!==null)?sum+fees[0]-fees[1]+fees[2]+fees[3]:null;
 const informed=cents(total),difference=calculated!==null&&informed!==null?informed-calculated:null;
 return {sum:sum===null?'':amount(sum),calculated:calculated===null?'':amount(calculated),difference:difference===null?'':amount(difference),matches:difference===null?null:difference===0n};
}
