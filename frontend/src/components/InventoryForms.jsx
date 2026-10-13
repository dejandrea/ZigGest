import React,{useEffect,useRef,useState} from 'react';
import api from '../services/api';
import ItemForm from './ItemForm';
import {registeredItem} from '../services/catalog';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import SupplierForm from './SupplierForm';

export function StockItemForm({item,initialValues={},onClose,onSuccess}){
 const [registered,setRegistered]=useState(null),[loading,setLoading]=useState(!!item),[error,setError]=useState('');
 useEffect(()=>{if(!item)return;let live=true;api.get('/itens').then(({data})=>{
  if(!live)return;const found=data.find(row=>row.stockId===item._id||row.codigoInsumo===item.codigoInsumo);
  if(!found)throw new Error('Item não encontrado no cadastro unificado.');
  setRegistered(found.key?found:registeredItem(null,item));
 }).catch(()=>{if(live)setError('Não foi possível carregar o cadastro do item. Feche e tente novamente.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[item]);
 if(loading||error)return <FormModal labelledBy="stock-loading-title" onClose={onClose}><div className="users-editor"><h2 id="stock-loading-title">Cadastro do item</h2>{error?<p role="alert">{error}</p>:<p role="status">Carregando item…</p>}<button type="button" onClick={onClose}>Fechar</button></div></FormModal>;
 return <ItemForm item={registered} initialValues={{produto:false,insumo:true,...initialValues}} onClose={onClose} onSuccess={(message,data,keepOpen)=>onSuccess(message,data._stock??data,keepOpen)}/>;
}

export function StockMovementForm({items,products=[],initialItem=null,onClose,onSuccess}){
 const [initial]=useState(()=>({tipo:'ENTRADA',itemId:initialItem?._id??'',codigoProduto:'',quantidade:'1',fator:'1',dataEntrada:'',observacoes:'',fornecedorId:'',totalEntrada:''}));
 const [form,setForm]=useState(initial),{busy,error,run}=useOperation(),request=useRef({});
 const dirty=JSON.stringify(form)!==JSON.stringify(initial),close=useFormClose(onClose,dirty,busy);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 const [creatingItem,setCreatingItem]=useState(false),[createdItems,setCreatedItems]=useState([]);
 const [creatingSupplier,setCreatingSupplier]=useState(false),[supplierNotice,setSupplierNotice]=useState('');
 const [suppliers,setSuppliers]=useState([]);
 useEffect(()=>{let active=true;api.get('/fornecedores').then(({data})=>{if(active)setSuppliers(data);}).catch(()=>{if(active)setSupplierNotice('Não foi possível carregar os fornecedores. Você poderá informar o fornecedor no financeiro.');});return()=>{active=false;};},[]);
 const availableItems=[...items.filter(i=>!createdItems.some(c=>c._id===i._id)),...createdItems];
 function itemCreated(_message,item,keepOpen){setCreatedItems(prev=>[...prev,item]);if(item.ativo)change('itemId',item._id);if(!keepOpen)setCreatingItem(false);}
 const item=availableItems.find(s=>s._id===form.itemId),preview=Number(form.quantidade)*Number(form.fator);
 async function save(e){
  e.preventDefault();const payload={...form,itemId:form.tipo==='ENTRADA'?form.itemId:'',codigoProduto:form.tipo==='SAIDA'?form.codigoProduto:'',fator:form.tipo==='SAIDA'?'1':form.fator,dataEntrada:form.tipo==='ENTRADA'?form.dataEntrada:''};
  const serialized=JSON.stringify(payload);
  if(request.current.payload!==serialized)request.current={payload:serialized,id:crypto.randomUUID()};
  try{const {data}=await run(()=>api.post('/movimentacoes-estoque',{...payload,requestId:request.current.id}));onSuccess('Movimentação registrada com sucesso.',form.tipo==='ENTRADA'?{sourceId:data.id??request.current.id}:null);}catch{/* O mesmo pedido mantém o UUID para nova tentativa segura. */}
 }
 return <><FormModal labelledBy="movement-title" dirty={dirty} busy={busy||creatingItem||creatingSupplier} onClose={close}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="movement-title">Nova movimentação</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  <p className="users-editor-intro">Entradas convertem embalagens em unidades e chegam ao estoque principal. Saídas usam a composição e o estoque de saída cadastrados no produto.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset className="product-fields" disabled={busy}>
   <label className="product-wide">Tipo<select value={form.tipo} onChange={e=>change('tipo',e.target.value)}><option value="ENTRADA">Entrada de estoque</option>{!initialItem&&<option value="SAIDA">Saída por produto</option>}</select></label>
   {form.tipo==='ENTRADA'&&<button type="button" className="users-secondary product-wide" onClick={()=>setCreatingItem(true)}>Novo insumo</button>}
   {form.tipo==='ENTRADA'&&<div className="product-wide"><button type="button" className="users-secondary" onClick={()=>setCreatingSupplier(true)}>Novo fornecedor</button>{supplierNotice&&<p role="status" className="users-message users-success">{supplierNotice}</p>}</div>}
   {form.tipo==='ENTRADA'&&<><label>Fornecedor (opcional)<select value={form.fornecedorId} onChange={e=>change('fornecedorId',e.target.value)}><option value="">Informar depois</option>{suppliers.filter(s=>s.ativo).map(s=><option key={s._id} value={s._id}>{s.nome}</option>)}</select></label><label>Valor total da entrada (opcional)<input type="number" min="0" step="0.000001" value={form.totalEntrada} onChange={e=>change('totalEntrada',e.target.value)}/></label></>}
   {form.tipo==='ENTRADA'?<><label className="product-wide">Item de estoque<select required value={form.itemId} onChange={e=>change('itemId',e.target.value)}><option value="">Selecione</option>{availableItems.filter(i=>i.ativo).map(i=><option key={i._id} value={i._id}>{i.nome} / {i.unidade}</option>)}</select></label><label>Quantidade de embalagens<input required type="number" min="0.001" step="0.001" value={form.quantidade} onChange={e=>change('quantidade',e.target.value)}/></label><label>Unidades por embalagem<input required type="number" min="0.001" step="0.001" value={form.fator} onChange={e=>change('fator',e.target.value)}/></label><p className="product-wide inventory-preview">Entrada: {Number.isFinite(preview)?preview.toLocaleString('pt-BR',{maximumFractionDigits:6}):'—'} {item?.unidade??'unidades'}. Exemplo: 12 packs × 12 latas = 144 UN.</p></>:<><label className="product-wide">Produto de venda<select required value={form.codigoProduto} onChange={e=>change('codigoProduto',e.target.value)}><option value="">Selecione</option>{products.filter(p=>p.ativo).map(p=><option key={p.codigoProduto} value={p.codigoProduto}>{p.nome}</option>)}</select></label><label className="product-wide">Quantidade vendida<input required type="number" min="0.001" step="0.001" value={form.quantidade} onChange={e=>change('quantidade',e.target.value)}/></label><p className="product-wide inventory-preview">Esta saída registra somente o estoque. Não gera venda, recebimento ou lançamento financeiro.</p></>}
   {form.tipo==='ENTRADA'&&<><label className="product-wide">Data de entrada (opcional)<input type="datetime-local" value={form.dataEntrada} onChange={e=>change('dataEntrada',e.target.value)}/></label><small className="product-wide">Informe quando a mercadoria chegou, inclusive em data passada. Em branco, usa o momento do lançamento. A entrada soma ao saldo atual e preserva as baixas anteriores.</small></>}
   <label className="product-wide">Observações<textarea required maxLength={2000} rows={3} value={form.observacoes} onChange={e=>change('observacoes',e.target.value)} placeholder="Documento ou motivo da movimentação"/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Registrando…':'Registrar movimentação'}</button></div>
  </fieldset></form>
 </div></FormModal>
 {creatingItem&&<StockItemForm onClose={()=>setCreatingItem(false)} onSuccess={itemCreated}/>}
 {creatingSupplier&&<SupplierForm onClose={()=>setCreatingSupplier(false)} onSuccess={(_message,supplier,keepOpen)=>{setSuppliers(prev=>[...prev,supplier]);change('fornecedorId',supplier.ativo?supplier._id:'');if(!keepOpen)setCreatingSupplier(false);setSupplierNotice('Fornecedor cadastrado: '+supplier.nome);}}/>}
 </>;
}
