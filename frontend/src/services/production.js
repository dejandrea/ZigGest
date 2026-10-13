import {stockQuantity} from './dataMapping';
import {decimalMoney,multiplyMoney,sumMoney} from './decimalMoney';
export function productionPayload(body){
 const data=body.data??{};
 if(body.action==='RECIPE')return {nome:String(data.nome??'').trim(),ativo:data.ativo!==false,observacoes:data.observacoes??'',
  inputs:(data.inputs??[]).map(line=>({item_id:line.item_id,quantidade:stockQuantity(line.quantidade),custo_unitario:amount(line.custo_unitario??0)})),
  outputs:(data.outputs??[]).map(line=>({product_id:line.product_id,quantidade:stockQuantity(line.quantidade)}))};
 if(body.action==='PRODUCE')return {recipe_id:data.recipe_id,multiplier:stockQuantity(data.multiplier),location_id:data.location_id||null,
  extra_cost:amount(data.extra_cost??0),ocorrido_em:data.ocorrido_em?new Date(data.ocorrido_em).toISOString():null,observacoes:data.observacoes??'',
  outputs:(data.outputs??[]).map(line=>({product_id:line.product_id,quantidade:stockQuantity(line.quantidade,true)}))};
 if(body.action==='REVERSE')return {motivo:data.motivo??''};
 throw new Error('Operação de produção inválida.');
}
function amount(value){const n=decimalMoney(value);if(n>9999999999.99)throw new Error('Custo fora do limite.');return n;}
export const productionQuantity=value=>Number(value).toLocaleString('pt-BR',{maximumFractionDigits:3});
export function productionPreview(recipe,factor=1){
 let cost=null;try{cost=sumMoney(recipe.inputs.map(line=>multiplyMoney((Number(line.quantidade)*Number(factor)).toFixed(6),line.custo_unitario??0)));}catch{/* Incomplete quantities are validated before saving. */}
 return {inputs:recipe.inputs.map(line=>({...line,quantidade:Number(line.quantidade)*Number(factor)})),outputs:recipe.outputs.map(line=>({...line,quantidade:Number(line.quantidade)*Number(factor)})),
  cost};
}
