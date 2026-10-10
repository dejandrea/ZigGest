import React,{useRef,useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import {StockItemForm} from './InventoryForms';
import SupplierForm from './SupplierForm';
import useOperation from '../hooks/useOperation';
import '../styles/pages/InvoiceEntry.css';
const emptyHeader={number:'',series:'1',issuerName:'',issuerDocument:'',issuedAt:'',total:'',recipientName:'',recipientDocument:''};
const blank=id=>({id,name:'',code:'',unit:'UN',invoiceQuantity:'1',unitPrice:'0',total:'0',stockItemId:'',quantity:'1',factor:'1'});
export default function ManualInvoiceEntryForm({items,onClose,onXml,onItemCreated=()=>{}}){
 const [header,setHeader]=useState(emptyHeader),[lines,setLines]=useState(()=>[blank(1)]),[arrival,setArrival]=useState(''),[notes,setNotes]=useState(''),[createdItems,setCreatedItems]=useState([]),[newItemId,setNewItemId]=useState(null),[newSupplier,setNewSupplier]=useState(false);
 const {busy,error,run}=useOperation(),request=useRef({}),nextId=useRef(2);
 const dirty=JSON.stringify(header)!==JSON.stringify(emptyHeader)||JSON.stringify(lines)!==JSON.stringify([blank(1)])||!!arrival||!!notes;
 const close=useFormClose(onClose,dirty,busy),switchMode=useFormClose(onXml,dirty,busy);
 const active=[...items.filter(i=>!createdItems.some(c=>c._id===i._id)),...createdItems].filter(i=>i.ativo);
 const selected=lines.find(l=>l.id===newItemId);
 function changeHeader(field,value){setHeader(h=>({...h,[field]:value}));}
 function change(id,field,value){setLines(prev=>prev.map(l=>l.id===id?{...l,[field]:value}:l));}
 async function save(event){event.preventDefault();try{await run(async()=>{
  const body={header,lines,dataEntrada:arrival,observacoes:notes},serialized=JSON.stringify(body);
  if(request.current.body!==serialized)request.current={body:serialized,id:crypto.randomUUID()};
  return api.post('/entradas-nfe-manual',{...body,requestId:request.current.id});
 }).then(({data})=>onClose('Nota manual registrada e estoque atualizado com sucesso.',{sourceId:data.id??request.current.id}));}catch{/* Preserva os campos e o pedido para repetição segura. */}}
 return <><FormModal labelledBy="manual-invoice-title" dirty={dirty} busy={busy||newItemId!==null||newSupplier} onClose={close}><div className="users-editor product-editor invoice-editor">
  <div className="users-editor-heading"><h2 id="manual-invoice-title">Entrada de NF-e manual</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  <p className="users-editor-intro">Digite os dados da nota e dos itens. XML e chave de acesso não são necessários.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset className="product-fields" disabled={busy}>
   <label className="product-wide">Forma de entrada<select value="manual" onChange={switchMode}><option value="xml">Importar XML</option><option value="manual">Digitar nota manualmente</option></select></label>
   {[['number','Número da nota'],['series','Série'],['issuerName','Nome / razão social do fornecedor'],['issuerDocument','CPF / CNPJ do fornecedor'],['issuedAt','Data de emissão'],['total','Valor total da nota'],['recipientName','Destinatário (opcional)'],['recipientDocument','CPF / CNPJ do destinatário (opcional)']].map(([field,label])=><label key={field}>{label}<input required={!field.startsWith('recipient')} type={field==='issuedAt'?'datetime-local':field==='total'?'number':'text'} min={field==='total'?'0':undefined} step={field==='total'?'0.01':undefined} maxLength={field.includes('Name')?200:field.includes('Document')?18:field==='number'?9:field==='series'?3:undefined} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/></label>)}
   <button type="button" className="users-secondary product-wide" onClick={()=>setNewSupplier(true)}>Novo fornecedor</button>
   <div className="product-wide invoice-items">{lines.map((line,index)=>{
    const stock=active.find(i=>i._id===line.stockItemId),delta=Number(line.quantity)*Number(line.factor);
    return <section key={line.id} className="invoice-item"><h3>Item {index+1}</h3><div className="invoice-line-fields">
     {[['name','Descrição'],['code','Código (opcional)'],['unit','Unidade na nota'],['invoiceQuantity','Quantidade na nota'],['unitPrice','Valor unitário'],['total','Valor total'],['quantity','Quantidade recebida'],['factor','Unidades por embalagem']].map(([field,label])=><label key={field}>{label+' do item '+(index+1)}<input required={field!=='code'} type={['invoiceQuantity','unitPrice','total','quantity','factor'].includes(field)?'number':'text'} min={['unitPrice','total'].includes(field)?'0':'0.001'} step={['unitPrice','total'].includes(field)?'0.01':'0.001'} maxLength={field==='unit'?10:field==='name'?200:100} value={line[field]} onChange={e=>change(line.id,field,e.target.value)}/></label>)}
     <label>Insumo do item {index+1}<select required value={line.stockItemId} onChange={e=>change(line.id,'stockItemId',e.target.value)}><option value="">Selecione o insumo</option>{active.map(i=><option key={i._id} value={i._id}>{i.nome} / {i.unidade}</option>)}</select></label>
    </div><div className="invoice-actions"><button type="button" className="users-secondary" onClick={()=>setNewItemId(line.id)}>Novo insumo para o item {index+1}</button><button type="button" className="users-secondary" disabled={lines.length===1} onClick={()=>setLines(prev=>prev.filter(l=>l.id!==line.id))}>Remover item {index+1}</button></div><p className="inventory-preview">Entrada do item {index+1}: {Number.isFinite(delta)?delta.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—'} {stock?.unidade??'unidades'}</p></section>;
   })}</div>
   <button type="button" className="users-secondary product-wide" disabled={lines.length>=990} onClick={()=>setLines(prev=>[...prev,blank(nextId.current++)])}>Adicionar item</button>
   <label className="product-wide">Data de entrada (opcional)<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
   <small className="product-wide">Pode ser retroativa. Em branco, usa o momento do registro.</small>
   <label className="product-wide">Observações da entrada<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Registrando…':'Registrar nota manual'}</button></div>
  </fieldset></form>
 </div></FormModal>
 {selected&&<StockItemForm initialValues={{nome:selected.name}} onClose={()=>setNewItemId(null)} onSuccess={(_message,item)=>{setCreatedItems(prev=>[...prev,item]);onItemCreated(item);if(item.ativo)change(newItemId,'stockItemId',item._id);setNewItemId(null);}}/>}
 {newSupplier&&<SupplierForm initialValues={{nome:header.issuerName,documento:header.issuerDocument}} onClose={()=>setNewSupplier(false)} onSuccess={(_message,supplier)=>{setHeader(h=>({...h,issuerName:supplier.nome,issuerDocument:supplier.documento}));setNewSupplier(false);}}/>}
 </>;
}
