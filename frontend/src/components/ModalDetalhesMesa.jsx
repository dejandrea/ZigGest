import React,{useEffect,useState} from 'react';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import Botao from './Botao';
import '../styles/components/Modal.css';

const initial={descricao:'',valorUnitario:'',quantidade:1};
export default function ModalDetalhesMesa({mesa,onClose}) {
  const [current,setCurrent]=useState(mesa),[items,setItems]=useState([]),[form,setForm]=useState(initial);
  const [editingId,setEditingId]=useState(null);
  const {error,busy,run}=useOperation();
  async function load(){
    const [mesas,result]=await Promise.all([api.get('/mesas'),api.get('/mesas/'+mesa.codigoMesa+'/itens')]);
    setCurrent(mesas.data.find(m=>m.codigoMesa===mesa.codigoMesa)??mesa);setItems(result.data);
  }
  useEffect(()=>{run(load).catch(()=>{});},[mesa.codigoMesa]);
  async function add(event){
    event.preventDefault();
    try {
      await run(async()=>{const body={...form,valorUnitario:Number(form.valorUnitario),quantidade:Number(form.quantidade)};if(editingId) await api.put('/mesas/'+mesa.codigoMesa+'/itens/'+editingId,body);else await api.post('/mesas/'+mesa.codigoMesa+'/itens',body);await load();});
      setForm(initial);setEditingId(null);
    }catch{/* useOperation displays the error. */}
  }
  async function remove(item){
    if(!window.confirm('Excluir este item da mesa?'))return;
    try {await run(async()=>{await api.delete('/mesas/'+mesa.codigoMesa+'/itens/'+item._id);await load();});}catch{}
  }
  async function deleteMesa(){
    if(!window.confirm('Excluir esta mesa?'))return;
    try{await run(()=>api.delete('/mesas/'+mesa.codigoMesa));onClose();}catch{}
  }
  async function changeStatus(){
    try {await run(async()=>{await api.put('/mesas/'+mesa.codigoMesa,{status:current.status==='aberta'?'fechada':'aberta'});await load();});}catch{}
  }
  const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  return <div className="modal-overlay"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="mesa-title">
    <h2 id="mesa-title">Mesa #{current.codigoMesa}</h2><p>Cliente: {current.nomeCliente||'Cliente sem nome'}</p><p>Status: {current.status}</p><p>Total: {money(current.totalGeral)}</p>
    {error&&<p role="alert">{error}</p>}
    <ul>{items.map(item=><li key={item._id}>{item.descricao} — {item.quantidade} × {money(item.valorUnitario)} = {money(item.total)} {current.status==='aberta'&&<><button disabled={busy} onClick={()=>{setEditingId(item._id);setForm({descricao:item.descricao,valorUnitario:item.valorUnitario,quantidade:item.quantidade});}}>Editar item</button><button disabled={busy} onClick={()=>remove(item)}>Excluir item</button></>}</li>)}</ul>
    {current.status==='aberta'&&<form onSubmit={add}>
      <label htmlFor="item-description">Descrição</label><input id="item-description" value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} required/>
      <label htmlFor="item-price">Valor unitário</label><input id="item-price" type="number" min="0" step="0.01" value={form.valorUnitario} onChange={e=>setForm({...form,valorUnitario:e.target.value})} required/>
      <label htmlFor="item-quantity">Quantidade</label><input id="item-quantity" type="number" min="1" step="1" value={form.quantidade} onChange={e=>setForm({...form,quantidade:e.target.value})} required/>
      <button disabled={busy}>{editingId?'Salvar item':'Adicionar item'}</button>{editingId&&<button type="button" onClick={()=>{setEditingId(null);setForm(initial);}}>Cancelar</button>}
    </form>}
    <div className="modal-buttons">{items.length===0&&<Botao disabled={busy} tamanho="xxsm" cor="terciario" onClick={deleteMesa}>Excluir mesa</Botao>}<Botao tamanho="xxsm" cor="terciario" disabled={busy} onClick={changeStatus}>{current.status==='aberta'?'Fechar mesa':'Reabrir mesa'}</Botao><Botao tamanho="xxsm" cor="terciario" onClick={onClose}>Voltar</Botao></div>
  </div></div>;
}
