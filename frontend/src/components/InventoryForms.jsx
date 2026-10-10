import React,{useRef,useState} from 'react';
import api from '../services/api';
import {productUnits} from '../services/dataMapping';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import SupplierForm from './SupplierForm';

export function StockItemForm({item,initialValues={},onClose,onSuccess}){
 const [initial]=useState(()=>({nome:item?.nome??initialValues.nome??'',unidade:item?.unidade??initialValues.unidade??'UN',estoqueMinimo:item?.estoqueMinimo??'',bloquearEstoqueNegativo:item?.bloquearEstoqueNegativo??false,observacoes:item?.observacoes??'',ativo:item?.ativo??true}));
 const [form,setForm]=useState(initial),{busy,error,run}=useOperation();
 const dirty=JSON.stringify(form)!==JSON.stringify(initial),close=useFormClose(onClose,dirty,busy);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 async function save(e){e.preventDefault();try{const {data}=await run(()=>item?api.put('/insumos/'+item.codigoInsumo,form):api.post('/insumos',form));onSuccess('Item de estoque salvo com sucesso.',data);}catch{/* Preserva formulário. */}}
 return <FormModal labelledBy="stock-title" dirty={dirty} busy={busy} onClose={close}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="stock-title">{item?'Editar item de estoque':'Novo item de estoque'}</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  <p className="users-editor-intro">Use a menor unidade controlada. Para Coca-Cola lata, escolha UN. O saldo começa em zero e é alterado por movimentações.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset disabled={busy} className="product-fields">
   <label className="product-wide">Nome do item<input required maxLength={200} autoFocus value={form.nome} onChange={e=>change('nome',e.target.value)}/></label>
   <label>Unidade de estoque<select disabled={!!item} value={form.unidade} onChange={e=>change('unidade',e.target.value)}>{productUnits.map(u=><option key={u}>{u}</option>)}</select></label>
   <label>Estoque mínimo (opcional)<input type="number" min="0" step="0.001" value={form.estoqueMinimo} onChange={e=>change('estoqueMinimo',e.target.value)}/></label>
   <small className="product-wide">Deixe em branco para não receber alertas de reposição deste insumo.</small>
   <label className="product-wide"><span className="inventory-toggle"><input type="checkbox" checked={form.bloquearEstoqueNegativo} onChange={e=>change('bloquearEstoqueNegativo',e.target.checked)}/> Bloquear saída com estoque negativo</span></label>
   <small className="product-wide">Desmarcado: permite baixar o insumo antes de lançar a entrada. O saldo negativo fica visível até ser regularizado.</small>
   {item&&<small className="product-wide">A unidade fica fixa para preservar o significado do saldo e dos vínculos.</small>}
   <label className="product-wide">Observações<textarea rows={3} maxLength={2000} value={form.observacoes} onChange={e=>change('observacoes',e.target.value)}/></label>
   <label className="product-wide">Situação<select value={String(form.ativo)} onChange={e=>change('ativo',e.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button className="users-primary" type="submit">{busy?'Salvando…':'Salvar item'}</button></div>
  </fieldset></form>
 </div></FormModal>;
}

export function StockMovementForm({items,products=[],initialItem=null,onClose,onSuccess}){
 const [initial]=useState(()=>({tipo:'ENTRADA',itemId:initialItem?._id??'',codigoProduto:'',quantidade:'1',fator:'1',dataEntrada:'',observacoes:''}));
 const [form,setForm]=useState(initial),{busy,error,run}=useOperation(),request=useRef({});
 const dirty=JSON.stringify(form)!==JSON.stringify(initial),close=useFormClose(onClose,dirty,busy);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 const [creatingItem,setCreatingItem]=useState(false),[createdItems,setCreatedItems]=useState([]);
 const [creatingSupplier,setCreatingSupplier]=useState(false),[supplierNotice,setSupplierNotice]=useState('');
 const availableItems=[...items.filter(i=>!createdItems.some(c=>c._id===i._id)),...createdItems];
 function itemCreated(_message,item){setCreatedItems(prev=>[...prev,item]);if(item.ativo)change('itemId',item._id);setCreatingItem(false);}
 const item=availableItems.find(s=>s._id===form.itemId),preview=Number(form.quantidade)*Number(form.fator);
 async function save(e){
  e.preventDefault();const payload={...form,itemId:form.tipo==='ENTRADA'?form.itemId:'',codigoProduto:form.tipo==='SAIDA'?form.codigoProduto:'',fator:form.tipo==='SAIDA'?'1':form.fator,dataEntrada:form.tipo==='ENTRADA'?form.dataEntrada:''};
  const serialized=JSON.stringify(payload);
  if(request.current.payload!==serialized)request.current={payload:serialized,id:crypto.randomUUID()};
  try{await run(()=>api.post('/movimentacoes-estoque',{...payload,requestId:request.current.id}));onSuccess('Movimentação registrada com sucesso.');}catch{/* O mesmo pedido mantém o UUID para nova tentativa segura. */}
 }
 return <><FormModal labelledBy="movement-title" dirty={dirty} busy={busy||creatingItem||creatingSupplier} onClose={close}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="movement-title">Nova movimentação</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  <p className="users-editor-intro">Entradas convertem embalagens em unidades de estoque. Saídas por produto usam a composição cadastrada.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset className="product-fields" disabled={busy}>
   <label className="product-wide">Tipo<select value={form.tipo} onChange={e=>change('tipo',e.target.value)}><option value="ENTRADA">Entrada de estoque</option>{!initialItem&&<option value="SAIDA">Saída por produto</option>}</select></label>
   {form.tipo==='ENTRADA'&&<button type="button" className="users-secondary product-wide" onClick={()=>setCreatingItem(true)}>Novo insumo</button>}
   {form.tipo==='ENTRADA'&&<div className="product-wide"><button type="button" className="users-secondary" onClick={()=>setCreatingSupplier(true)}>Novo fornecedor</button>{supplierNotice&&<p role="status" className="users-message users-success">{supplierNotice}</p>}</div>}
   {form.tipo==='ENTRADA'?<><label className="product-wide">Item de estoque<select required value={form.itemId} onChange={e=>change('itemId',e.target.value)}><option value="">Selecione</option>{availableItems.filter(i=>i.ativo).map(i=><option key={i._id} value={i._id}>{i.nome} / {i.unidade}</option>)}</select></label><label>Quantidade de embalagens<input required type="number" min="0.001" step="0.001" value={form.quantidade} onChange={e=>change('quantidade',e.target.value)}/></label><label>Unidades por embalagem<input required type="number" min="0.001" step="0.001" value={form.fator} onChange={e=>change('fator',e.target.value)}/></label><p className="product-wide inventory-preview">Entrada: {Number.isFinite(preview)?preview.toLocaleString('pt-BR',{maximumFractionDigits:6}):'—'} {item?.unidade??'unidades'}. Exemplo: 12 packs × 12 latas = 144 UN.</p></>:<><label className="product-wide">Produto de venda<select required value={form.codigoProduto} onChange={e=>change('codigoProduto',e.target.value)}><option value="">Selecione</option>{products.filter(p=>p.ativo).map(p=><option key={p.codigoProduto} value={p.codigoProduto}>{p.nome}</option>)}</select></label><label className="product-wide">Quantidade vendida<input required type="number" min="0.001" step="0.001" value={form.quantidade} onChange={e=>change('quantidade',e.target.value)}/></label><p className="product-wide inventory-preview">Esta saída registra somente o estoque. Não gera venda, recebimento ou lançamento financeiro.</p></>}
   {form.tipo==='ENTRADA'&&<><label className="product-wide">Data de entrada (opcional)<input type="datetime-local" value={form.dataEntrada} onChange={e=>change('dataEntrada',e.target.value)}/></label><small className="product-wide">Informe quando a mercadoria chegou, inclusive em data passada. Em branco, usa o momento do lançamento. A entrada soma ao saldo atual e preserva as baixas anteriores.</small></>}
   <label className="product-wide">Observações<textarea required maxLength={2000} rows={3} value={form.observacoes} onChange={e=>change('observacoes',e.target.value)} placeholder="Documento ou motivo da movimentação"/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Registrando…':'Registrar movimentação'}</button></div>
  </fieldset></form>
 </div></FormModal>
 {creatingItem&&<StockItemForm onClose={()=>setCreatingItem(false)} onSuccess={itemCreated}/>}
 {creatingSupplier&&<SupplierForm onClose={()=>setCreatingSupplier(false)} onSuccess={(_message,supplier)=>{setCreatingSupplier(false);setSupplierNotice('Fornecedor cadastrado: '+supplier.nome);}}/>}
 </>;
}
