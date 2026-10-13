import React,{useEffect,useState} from 'react';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import {money} from '../services/finance';
export default function ComandaProductPicker({comanda,products,onSaved,onDirty,onBusy}){
 const [search,setSearch]=useState(''),[quantity,setQuantity]=useState(1),[selected,setSelected]=useState('');
 const [request,setRequest]=useState(()=>crypto.randomUUID());
 const {busy,error,run}=useOperation();
 useEffect(()=>{onBusy?.(busy);return()=>onBusy?.(false);},[busy,onBusy]);
 const matches=products.filter(p=>p.ativo&&[p.nome,p.codigoProduto,p.codigoBarras].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 async function add(event){event.preventDefault();try{await run(async()=>{
  const product=products.find(p=>p._id===selected&&p.ativo)??matches.find(p=>p.codigoBarras===search.trim()&&search.trim());
  if(!product)throw new Error('Selecione um produto ou informe seu código de barras.');
  if(!Number.isSafeInteger(Number(quantity))||Number(quantity)<1)throw new Error('Informe uma quantidade inteira maior que zero.');
  await api.post('/comandas',{id:comanda.id,action:'ADD_PRODUCT',data:{request_id:request,total:Number(comanda.total_geral),paid_total:Number(comanda.paid_total??0),product_id:product._id,quantidade:Number(quantity)}});
 });setSearch('');setSelected('');setQuantity(1);setRequest(crypto.randomUUID());onDirty?.(false);await onSaved();}catch{/* Keep product selection. */}}
 return <section className="comanda-products"><h3>Adicionar produto</h3>{error&&<p role="alert" className="users-message users-error">{error}</p>}<form onSubmit={add}><fieldset className="product-fields" disabled={busy}><label className="product-wide">Buscar produto ou código de barras<input value={search} onChange={e=>{setSearch(e.target.value);setSelected('');setRequest(crypto.randomUUID());onDirty?.(!!e.target.value);}}/></label><label className="product-wide">Produto<select value={selected} onChange={e=>{setSelected(e.target.value);setRequest(crypto.randomUUID());onDirty?.(!!e.target.value||!!search);}}><option value="">Selecione um produto</option>{matches.slice(0,100).map(p=><option key={p._id} value={p._id}>{p.nome} · {money(p.precoVenda)} · #{p.codigoProduto}</option>)}</select></label><label>Quantidade do produto<input type="number" min="1" step="1" value={quantity} onChange={e=>{setQuantity(e.target.value);setRequest(crypto.randomUUID());}}/></label><button className="users-primary" type="submit">Adicionar produto</button></fieldset></form></section>;
}
