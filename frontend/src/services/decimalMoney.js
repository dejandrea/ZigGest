// Monetary arithmetic uses integer millionths, avoiding floating point sum errors.
export function moneyUnits(value, signed=false){
 const text=String(value??'').trim().replace(',','.');
 if(!(signed?/^-?\d+(\.\d{1,6})?$/:/^\d+(\.\d{1,6})?$/).test(text))throw new Error('Informe um valor com até seis casas decimais.');
 const negative=text.startsWith('-'),[whole,fraction='']=text.replace(/^-/,'').split('.');
 const units=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 if(units>999999999999990000n)throw new Error('Valor fora do limite.');
 return negative?-units:units;
}
export function moneyText(units){
 const absolute=units<0n?-units:units;
 const fraction=String(absolute%1000000n).padStart(6,'0').replace(/0+$/,'').padEnd(2,'0');
 return (units<0n?'-':'')+String(absolute/1000000n)+'.'+fraction;
}
export function decimalMoney(value){return Number(moneyText(moneyUnits(value)));}
export function sumMoney(values){return Number(moneyText(values.reduce((sum,value)=>sum+moneyUnits(value,true),0n)));}
export function subtractMoney(left,right){return Number(moneyText(moneyUnits(left,true)-moneyUnits(right,true)));}
export function multiplyMoney(quantity,cost){
 const text=String(quantity).replace(',','.');
 const price=String(cost).replace(',','.');
 if(!/^\d+(\.\d{1,6})?$/.test(text)||!/^\d+(\.\d{1,10})?$/.test(price))throw new Error('Quantidade ou custo inválido.');
 const [whole,fraction='']=text.split('.'),qty=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
 const [integer,decimal='']=price.split('.'),unitCost=BigInt(integer)*10000000000n+BigInt(decimal.padEnd(10,'0'));
 return moneyText((qty*unitCost+5000000000n)/10000000000n);
}
