const precision={quantity:3,price:4,money:2};
function scaled(value,kind){
 const text=String(value).trim().replace(',','.'),digits=precision[kind];
 if(!new RegExp('^\\d+(\\.\\d{1,'+digits+'})?$').test(text))throw new Error('Confira quantidades e valores da cotação.');
 const [integer,fraction='']=text.split('.');return BigInt(integer)*10n**BigInt(digits)+BigInt(fraction.padEnd(digits,'0'));
}
export function lineCents(quantity,price){
 const value=(scaled(quantity,'quantity')*scaled(price,'price')+50000n)/100000n;
 if(value>999999999999n)throw new Error('O valor da compra ultrapassa o limite permitido.');return Number(value);
}
function moneyCents(value){const n=scaled(value,'money');if(n>999999999999n)throw new Error('Valor fora do limite.');return Number(n);}
export function suggestedQuantity(item){
 const step=['UN','CX','PCT'].includes(item.unidade)?1:0.001;
 return Number((Math.ceil((Number(item.estoqueMinimo)-Number(item.saldo))/step)*step+step).toFixed(3));
}
export function quotationPayload(form){
 if(!String(form.nome).trim()||String(form.nome).trim().length>200)throw new Error('Informe um nome para a cotação, com até 200 caracteres.');
 const items=form.items.map(i=>({...i,quantidade:String(i.quantidade).replace(',','.')}));
 if(!items.length||items.some(i=>scaled(i.quantidade,'quantity')<=0n))throw new Error('Informe a quantidade dos insumos selecionados.');
 const offers=form.offers.map(o=>({supplier_id:o.supplier_id,frete:String(o.frete||0).replace(',','.'),desconto:String(o.desconto||0).replace(',','.'),validade:o.validade,prazo_dias:Number(o.prazo_dias),items:items.filter(i=>String(o.prices[i.item_id]??'').trim()!=='').map(i=>{const p=String(o.prices[i.item_id]).replace(',','.');if(scaled(p,'price')<=0n)throw new Error('Preço cotado deve ser maior que zero.');return {item_id:i.item_id,preco_unitario:p};})}));
 const ids=new Set();for(const o of offers){if(!o.supplier_id||ids.has(o.supplier_id))throw new Error('Selecione fornecedores diferentes.');ids.add(o.supplier_id);if(!/^\d{4}-\d{2}-\d{2}$/.test(o.validade)||!Number.isInteger(o.prazo_dias)||o.prazo_dias<0||o.prazo_dias>3650)throw new Error('Confira validade e prazo da proposta.');moneyCents(o.frete);moneyCents(o.desconto);}
 return {nome:form.nome,items:items.map(i=>({item_id:i.item_id,quantidade:i.quantidade})),offers};
}
export function comparison(items,offers,suppliers,today){
 const active=new Set(suppliers.filter(s=>s.ativo).map(s=>s._id)),names=new Map(suppliers.map(s=>[s._id,s.nome]));
 const totals=offers.map(o=>{
  const prices=new Map(o.items.map(p=>[p.item_id,p.preco_unitario]));const covered=items.filter(i=>prices.has(i.item_id));
  const subtotal=covered.reduce((sum,i)=>sum+lineCents(i.quantidade,prices.get(i.item_id)),0),discount=moneyCents(o.desconto),freight=moneyCents(o.frete);
  if(discount>subtotal)throw new Error('O desconto não pode ultrapassar os itens cotados.');
  const expired=o.validade<today,inactive=!active.has(o.supplier_id),complete=covered.length===items.length;
  return {...o,nome:names.get(o.supplier_id)??o.fornecedor_nome??'Fornecedor',subtotal,freight,discount,total:subtotal+freight-discount,complete,expired,inactive,covered:covered.length};
 });
 const eligible=totals.filter(o=>!o.expired&&!o.inactive),full=eligible.filter(o=>o.complete).sort((a,b)=>a.total-b.total||a.supplier_id.localeCompare(b.supplier_id));
 const perItem=items.map(i=>{
  const choices=eligible.filter(o=>o.items.some(p=>p.item_id===i.item_id)).map(o=>({...o,price:Number(o.items.find(p=>p.item_id===i.item_id).preco_unitario)})).sort((a,b)=>a.price-b.price||a.supplier_id.localeCompare(b.supplier_id));
  return {...i,choices,best:choices[0]};
 });
 const groups=eligible.map(o=>{
  const selected=perItem.filter(i=>i.best?.supplier_id===o.supplier_id);if(!selected.length)return null;
  const subtotal=selected.reduce((s,i)=>s+lineCents(i.quantidade,i.best.price),0),discount=selected.length===o.items.length?o.discount:0;
  return {...o,selected,subtotal,discount,total:subtotal+o.freight-discount};
 }).filter(Boolean);
 const splitTotal=groups.reduce((s,g)=>s+g.total,0),completeSplit=perItem.every(i=>i.best);
 if(totals.some(o=>o.total>999999999999)||splitTotal>999999999999)throw new Error('O valor da compra ultrapassa o limite permitido.');
 return {totals,bestTotal:full[0],perItem,groups,splitTotal,completeSplit};
}
export function formFromRound(round){return {nome:round.nome,items:structuredClone(round.items),offers:round.offers.map(o=>({...o,prices:Object.fromEntries(o.items.map(i=>[i.item_id,String(i.preco_unitario)]))}))};}
export function localToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
