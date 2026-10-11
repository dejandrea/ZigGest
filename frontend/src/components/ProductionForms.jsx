import React,{useRef,useState} from 'react';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import FormModal,{useFormClose} from './FormModal';
import {productionPreview,productionQuantity as q} from '../services/production';
import {money} from '../services/finance';

function useSave(action,id,revision,onSuccess){
 const operation=useOperation(),request=useRef({});
 async function save(data){
  const body=JSON.stringify(data);if(request.current.body!==body)request.current={body,id:crypto.randomUUID()};
  try{const result=await operation.run(()=>api.post('/producao',{requestId:request.current.id,id,action,revision,data}));onSuccess(result.data);}catch{/* Preserve form and request for retries. */}
 }
 return {...operation,save};
}
export function RecipeForm({recipe,items,onClose,onSuccess}){
 const initial=useRef(recipe??{nome:'',ativo:true,observacoes:'',inputs:[{item_id:'',quantidade:'1',custo_unitario:'0'}],outputs:[{product_id:'',quantidade:'1'}]}),id=useRef(recipe?.id??crypto.randomUUID());
 const [form,setForm]=useState(initial.current),op=useSave('RECIPE',id.current,recipe?.revision??null,onSuccess);
 const dirty=JSON.stringify(form)!==JSON.stringify(initial.current),close=useFormClose(onClose,dirty,op.busy);
 const change=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 const update=(key,index,field,value)=>change(key,form[key].map((line,i)=>i===index?{...line,[field]:value}:line));
 const stocks=items.filter(item=>item.insumo),products=items.filter(item=>item.produto&&item.insumo&&item.abastecimento==='PRODUCTION');
 return <FormModal labelledBy="recipe-title" onClose={close} dirty={dirty} busy={op.busy}><div className="users-editor product-editor"><h2 id="recipe-title">{recipe?'Editar ficha técnica':'Nova ficha técnica de produção'}</h2><p>Ingredientes por lote e rendimento esperado. Uma ficha pode gerar vários produtos.</p>
  {op.error&&<p role="alert" className="users-message users-error">{op.error}</p>}
  <form onSubmit={event=>{event.preventDefault();op.save(form);}}><fieldset disabled={op.busy} className="product-fields">
   <label className="product-wide">Nome da ficha<input required maxLength={200} value={form.nome} onChange={event=>change('nome',event.target.value)}/></label>
   <label>Situação da ficha<select value={String(form.ativo)} onChange={event=>change('ativo',event.target.value==='true')}><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
   <section className="product-wide product-composition"><h3>Ingredientes por lote</h3>{form.inputs.map((line,index)=><div className="production-input" key={index}>
    <label>Ingrediente {index+1}<select required value={line.item_id} onChange={event=>update('inputs',index,'item_id',event.target.value)}><option value="">Selecione</option>{stocks.map(item=><option key={item.stockId} value={item.stockId} disabled={!item.ativo&&item.stockId!==line.item_id||form.inputs.some((row,i)=>i!==index&&row.item_id===item.stockId)}>{item.nome} / {item.unidade}{item.ativo?'':' (inativo)'}</option>)}</select></label>
    <label>Quantidade do ingrediente {index+1}<input required type="number" min="0.001" step="0.001" value={line.quantidade} onChange={event=>update('inputs',index,'quantidade',event.target.value)}/></label>
    <label>Custo por unidade do ingrediente {index+1} (R$)<input required type="number" min="0" step="0.01" value={line.custo_unitario} onChange={event=>update('inputs',index,'custo_unitario',event.target.value)}/></label>
    <button type="button" className="users-edit" disabled={form.inputs.length===1} onClick={()=>change('inputs',form.inputs.filter((_,i)=>i!==index))}>Remover ingrediente {index+1}</button>
   </div>)}<button type="button" className="users-secondary" disabled={form.inputs.length>=50} onClick={()=>change('inputs',[...form.inputs,{item_id:'',quantidade:'1',custo_unitario:'0'}])}>Adicionar ingrediente</button><p>Use a unidade do estoque: por exemplo, farinha em KG e ovos em UN. Custos são informados por você e servem como estimativa.</p></section>
   <section className="product-wide product-composition"><h3>Produtos e rendimento previsto por lote</h3><p>No cadastro de itens, marque Produto e Insumo e escolha “Abastecido por produção”. Não é necessário informar peso ou consumo de massa por tamanho.</p>{form.outputs.map((line,index)=><div className="product-component" key={index}>
    <label>Produto produzido {index+1}<select required value={line.product_id} onChange={event=>update('outputs',index,'product_id',event.target.value)}><option value="">Selecione</option>{products.map(item=><option key={item.productId} value={item.productId} disabled={!item.ativo&&item.productId!==line.product_id||form.outputs.some((row,i)=>i!==index&&row.product_id===item.productId)}>{item.nome} / {item.unidade}{item.ativo?'':' (inativo)'}</option>)}</select></label>
    <label>Rendimento previsto {index+1}<input required type="number" min="0.001" step="0.001" value={line.quantidade} onChange={event=>update('outputs',index,'quantidade',event.target.value)}/></label>
    <button type="button" className="users-edit" disabled={form.outputs.length===1} onClick={()=>change('outputs',form.outputs.filter((_,i)=>i!==index))}>Remover produto {index+1}</button>
   </div>)}<button type="button" className="users-secondary" disabled={form.outputs.length>=50} onClick={()=>change('outputs',[...form.outputs,{product_id:'',quantidade:'1'}])}>Adicionar produto</button></section>
   <label className="product-wide">Observações da ficha<textarea maxLength={2000} value={form.observacoes} onChange={event=>change('observacoes',event.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button className="users-primary" type="submit">{op.busy?'Salvando…':'Salvar ficha técnica'}</button></div>
  </fieldset></form></div></FormModal>;
}
export function ProductionForm({recipe,items,locations,onClose,onSuccess}){
 const initial=useRef({recipe_id:recipe.id,multiplier:'1',location_id:'',extra_cost:'0',ocorrido_em:'',observacoes:'',outputs:recipe.outputs.map(line=>({...line,quantidade:String(line.quantidade)}))}),id=useRef(crypto.randomUUID());
 const [form,setForm]=useState(initial.current),op=useSave('PRODUCE',id.current,recipe.revision,onSuccess);
 const dirty=JSON.stringify(form)!==JSON.stringify(initial.current),close=useFormClose(onClose,dirty,op.busy);
 const preview=productionPreview(recipe,form.multiplier),byStock=new Map(items.map(item=>[item.stockId,item])),byProduct=new Map(items.map(item=>[item.productId,item]));
 const change=(key,value)=>setForm(previous=>({...previous,[key]:value}));
 function multiplier(value){setForm(previous=>({...previous,multiplier:value,outputs:recipe.outputs.map(line=>({...line,quantidade:String(Math.round(Number(line.quantidade)*Number(value)*1000)/1000)}))}));}
 return <FormModal labelledBy="produce-title" onClose={close} dirty={dirty} busy={op.busy}><div className="users-editor product-editor"><h2 id="produce-title">Produzir — {recipe.nome}</h2><p>A produção baixa os ingredientes uma vez e dá entrada nos produtos acabados no estoque principal.</p>
  {op.error&&<p role="alert" className="users-message users-error">{op.error}</p>}
  <form onSubmit={event=>{event.preventDefault();if(window.confirm('Confirmar a produção? Os ingredientes serão baixados e as quantidades produzidas entrarão no estoque principal.'))op.save(form);}}><fieldset disabled={op.busy} className="product-fields">
   <label>Lotes da ficha<input required type="number" min="0.001" max="999999" step="0.001" value={form.multiplier} onChange={event=>multiplier(event.target.value)}/></label>
   <label>Estoque de consumo<select value={form.location_id} onChange={event=>change('location_id',event.target.value)}><option value="">Principal</option>{locations.filter(row=>row.ativo&&!row.principal).map(row=><option key={row.id} value={row.id}>{row.nome}</option>)}</select></label>
   <label>Data da produção (opcional)<input type="datetime-local" value={form.ocorrido_em} onChange={event=>change('ocorrido_em',event.target.value)}/></label>
   <label>Custos adicionais (R$)<input required type="number" min="0" step="0.01" value={form.extra_cost} onChange={event=>change('extra_cost',event.target.value)}/></label>
   <section className="product-wide product-composition"><h3>Ingredientes a consumir</h3>{preview.inputs.map(line=><p key={line.item_id}>{byStock.get(line.item_id)?.nome??'Ingrediente indisponível'}: {q(line.quantidade)} {byStock.get(line.item_id)?.unidade}</p>)}<p>Custo estimado do lote: <strong>{money(preview.cost+Number(form.extra_cost||0))}</strong> (custos informados na ficha, sem gerar lançamento financeiro).</p></section>
   <section className="product-wide product-composition"><h3>Quantidades realmente produzidas</h3><p>Você pode alterar a distribuição entre os produtos. Informe zero para o produto que não foi feito neste lote.</p>{form.outputs.map((line,index)=><label key={line.product_id}>{byProduct.get(line.product_id)?.nome??'Produto indisponível'} — produzido ({byProduct.get(line.product_id)?.unidade})<input aria-label={'Quantidade produzida '+(byProduct.get(line.product_id)?.nome??index+1)} required type="number" min="0" step="0.001" value={line.quantidade} onChange={event=>change('outputs',form.outputs.map((row,i)=>i===index?{...row,quantidade:event.target.value}:row))}/><small>Previsto: {q(preview.outputs[index].quantidade)}</small></label>)}</section>
   <label className="product-wide">Observações da produção<textarea maxLength={2000} value={form.observacoes} onChange={event=>change('observacoes',event.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{op.busy?'Registrando…':'Confirmar produção'}</button></div>
  </fieldset></form></div></FormModal>;
}
export function ReverseProduction({batch,onClose,onSuccess}){
 const [reason,setReason]=useState(''),op=useSave('REVERSE',batch.id,null,onSuccess),close=useFormClose(onClose,!!reason,op.busy);
 return <FormModal labelledBy="reverse-production-title" onClose={close} dirty={!!reason} busy={op.busy}><div className="users-editor"><h2 id="reverse-production-title">Estornar produção #{batch.numero}</h2><p>Os produtos serão retirados do principal e os ingredientes voltarão ao setor original. O histórico será preservado.</p>{op.error&&<p role="alert" className="users-message users-error">{op.error}</p>}<form onSubmit={event=>{event.preventDefault();if(window.confirm('Confirmar o estorno desta produção?'))op.save({motivo:reason});}}><fieldset disabled={op.busy} className="product-fields"><label className="product-wide">Motivo do estorno<textarea required minLength={3} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/></label><div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">Confirmar estorno</button></div></fieldset></form></div></FormModal>;
}
