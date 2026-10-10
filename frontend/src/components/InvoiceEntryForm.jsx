import React,{useRef,useState} from 'react';
import api from '../services/api';
import {stockQuantity} from '../services/dataMapping';
import {NFE_PORTAL,normalizeInvoiceKey,validInvoiceKey,readNfeFile,localDateTime} from '../services/nfe';
import {StockItemForm} from './InventoryForms';
import SupplierForm from './SupplierForm';
import ManualInvoiceEntryForm from './ManualInvoiceEntryForm';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import '../styles/pages/InvoiceEntry.css';
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4});
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export default function InvoiceEntryForm({items,onClose,onSuccess}){
 const [document,setDocument]=useState(null),[lines,setLines]=useState([]),[arrival,setArrival]=useState(''),[notes,setNotes]=useState(''),[key,setKey]=useState(''),[copied,setCopied]=useState(false);
 const {busy,error,run,setError}=useOperation(),request=useRef({}),importSequence=useRef(0);
 const dirty=!!document||!!key||!!notes,close=useFormClose(onClose,dirty,busy);
 const [newItemLine,setNewItemLine]=useState(null),[createdItems,setCreatedItems]=useState([]);
 const [creatingSupplier,setCreatingSupplier]=useState(false),[supplierNotice,setSupplierNotice]=useState('');
 async function openSupplier(){
  try{await run(async()=>{
   const {data}=await api.get('/fornecedores');
   const existing=data.find(s=>s.documento?.replace(/\D/g,'')===document.invoice.supplier.documento);
   if(existing){setSupplierNotice('Fornecedor já cadastrado: '+existing.nome+(existing.ativo?'':' (inativo)'));return;}
   setCreatingSupplier(true);
  });}catch{/* Mantém a entrada e informa a falha de consulta. */}
 }
 const active=[...items.filter(i=>!createdItems.some(c=>c._id===i._id)),...createdItems].filter(i=>i.ativo);
 function itemCreated(_message,item){setCreatedItems(prev=>[...prev,item]);change(newItemLine,'stockItemId',item.ativo?item._id:'');setNewItemLine(null);}
 async function loadFile(event){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  if(document&&!window.confirm('Substituir a nota e descartar os vínculos não salvos?'))return;
  const sequence=++importSequence.current;
  try{await run(async()=>{
   const loaded=await readNfeFile(file);
   if(sequence!==importSequence.current)return;
   if(key&&!validInvoiceKey(key))throw new Error('Informe uma chave válida ou limpe o campo antes de importar.');
   if(key&&normalizeInvoiceKey(key)!==loaded.invoice.key)throw new Error('O XML pertence a outra chave de acesso.');
   setDocument(loaded);setKey(loaded.invoice.key);setLines(loaded.invoice.items.map(i=>({line:i.line,stockItemId:'',quantity:String(Number(i.quantity)),factor:'1'})));
   setArrival(localDateTime(loaded.invoice.issuedAt));setCopied(false);setSupplierNotice('');
  });}catch{/* Preserva a nota anterior em caso de falha. */}
 }
 function change(index,field,value){setLines(prev=>prev.map((l,i)=>i===index?{...l,[field]:value}:l));}
 async function copyKey(){try{await navigator.clipboard.writeText(normalizeInvoiceKey(key));setCopied(true);}catch{setError('Copie a chave do campo e cole no portal oficial.');}}
 async function save(event){
  event.preventDefault();
  try{await run(async()=>{
   if(!document)throw new Error('Importe o XML da NF-e.');
   for(const line of lines){
    if(!active.some(i=>i._id===line.stockItemId))throw new Error('Vincule todos os itens a insumos ativos.');
    const total=stockQuantity(line.quantity)*stockQuantity(line.factor);
    if(!Number.isFinite(total)||Math.abs(total*1000-Math.round(total*1000))>0.00001)throw new Error('A conversão deve resultar em até três casas decimais.');
   }
   const body={xml:document.xml,lines,dataEntrada:arrival,observacoes:notes},serialized=JSON.stringify(body);
   if(request.current.body!==serialized)request.current={body:serialized,id:crypto.randomUUID()};
   await api.post('/entradas-nfe',{...body,requestId:request.current.id});
  });onSuccess('NF-e importada e estoque atualizado com sucesso.');}catch{/* UUID preservado para repetir a mesma entrada com segurança. */}
 }
 const invoice=document?.invoice;
 const [mode,setMode]=useState('xml');
 if(mode==='manual')return <ManualInvoiceEntryForm items={active} onItemCreated={item=>setCreatedItems(prev=>[...prev.filter(i=>i._id!==item._id),item])} onXml={()=>setMode('xml')} onClose={message=>{if(message)onSuccess(message);else onClose();}}/>;
 return <><FormModal labelledBy="invoice-title" dirty={dirty} busy={busy||newItemLine!==null||creatingSupplier} onClose={close}><div className="users-editor product-editor invoice-editor">
  <div className="users-editor-heading"><h2 id="invoice-title">Entrada por NF-e</h2><button type="button" aria-label="Fechar formulário" disabled={busy} onClick={close}>×</button></div>
  <p className="users-editor-intro">Importe o XML completo, vincule os produtos aos insumos e confira as quantidades antes de registrar.</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset disabled={busy} className="product-fields">
   <label className="product-wide">Forma de entrada<select value="xml" onChange={()=>{if(!dirty||window.confirm('Descartar os dados desta entrada para digitar a nota manualmente?'))setMode('manual');}}><option value="xml">Importar XML</option><option value="manual">Digitar nota manualmente</option></select></label>
   <section className="product-wide invoice-source" aria-label="Obter XML da nota">
    <label>Chave de acesso (44 dígitos)<input inputMode="numeric" value={key} readOnly={!!document} onChange={e=>{setKey(e.target.value);setCopied(false);}} placeholder="Digite a chave para consultar no portal"/></label>
    <div className="invoice-actions"><button type="button" className="users-secondary" disabled={!validInvoiceKey(key)} onClick={copyKey}>{copied?'Chave copiada':'Copiar chave'}</button><a className="users-secondary" href={NFE_PORTAL} target="_blank" rel="noopener noreferrer">Abrir portal oficial</a></div>
    <p>Copie a chave e consulte no portal. O download pode exigir certificado digital e autorização de acesso. Depois, selecione o XML baixado aqui.</p>
    <label>Arquivo XML da NF-e<input type="file" accept=".xml,application/xml,text/xml" onChange={loadFile}/></label>
    {document&&<button type="button" className="users-secondary" onClick={()=>{if(window.confirm('Descartar a nota e os vínculos não salvos?')){setDocument(null);setLines([]);setKey('');setArrival('');}}}>Limpar nota</button>}
   </section>
   {invoice&&<>
    <div className="product-wide"><button type="button" className="users-secondary" onClick={openSupplier}>Cadastrar fornecedor da NF-e</button>{supplierNotice&&<p role="status" className="users-message users-success">{supplierNotice}</p>}</div>
    <section className="product-wide invoice-summary" aria-label="Dados da NF-e"><h3>NF-e {invoice.number} / Série {invoice.series}</h3><p><strong>Fornecedor:</strong> {invoice.issuerName} · {invoice.issuerDocument}</p><p><strong>Destinatário:</strong> {invoice.recipientName} · {invoice.recipientDocument}</p><p><strong>Emissão:</strong> {new Date(invoice.issuedAt).toLocaleString('pt-BR')} · <strong>Total:</strong> {money.format(Number(invoice.total))}</p><p>Confira o destinatário e a situação atual da nota no portal antes de registrar.</p></section>
    <div className="product-wide invoice-items">{invoice.items.map((item,index)=>{
     const line=lines[index],stock=active.find(i=>i._id===line.stockItemId),total=Number(line.quantity)*Number(line.factor);
     return <section key={item.line} className="invoice-item" aria-label={'Item '+item.line+' da nota'}><h3>{item.line}. {item.name}</h3><p className="inventory-code">Código {item.code} · NCM {item.ncm} · CFOP {item.cfop}</p><p>Na nota: {number.format(Number(item.quantity))} {item.unit} · Valor unitário: {money.format(Number(item.unitPrice))} · Total: {money.format(Number(item.total))}</p>
      <div className="invoice-line-fields"><label>Insumo do item {item.line}<select required value={line.stockItemId} onChange={e=>change(index,'stockItemId',e.target.value)}><option value="">Selecione o insumo</option>{active.map(i=><option key={i._id} value={i._id}>{i.nome} / {i.unidade}</option>)}</select></label><label>Quantidade recebida do item {item.line}<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={e=>change(index,'quantity',e.target.value)}/></label><label>Unidades por embalagem do item {item.line}<input required type="number" min="0.001" step="0.001" value={line.factor} onChange={e=>change(index,'factor',e.target.value)}/></label></div>
      <button type="button" className="users-secondary" onClick={()=>setNewItemLine(index)}>Novo insumo para o item {item.line}</button>
      <p className="inventory-preview">Entrada do item {item.line}: {Number.isFinite(total)?number.format(total):'—'} {stock?.unidade??'unidades'}</p>
     </section>;
    })}</div>
    <small className="product-wide">Exemplo: Coca-Cola com 2 pacotes na nota e 12 unidades por embalagem = 24 UN. A quantidade original da nota é preservada; ajuste a recebida quando necessário. Use Novo insumo no item da nota para cadastrar sem perder esta entrada.</small>
    <label className="product-wide">Data de entrada<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/></label>
    <small className="product-wide">A data inicia na emissão da nota. Ajuste para a chegada real, inclusive retroativa; em branco, usa o momento do registro.</small>
    <label className="product-wide">Observações da entrada<textarea maxLength={2000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   </>}
   {!active.length&&<p className="product-wide">Cadastre ou ative os insumos antes de registrar a entrada.</p>}
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary" disabled={!invoice||!active.length}>{busy?'Registrando…':'Registrar entrada da NF-e'}</button></div>
  </fieldset></form>
 </div></FormModal>
 {newItemLine!==null&&<StockItemForm initialValues={{nome:invoice.items[newItemLine].name}} onClose={()=>setNewItemLine(null)} onSuccess={itemCreated}/>}
 {creatingSupplier&&<SupplierForm initialValues={invoice.supplier} onClose={()=>setCreatingSupplier(false)} onSuccess={(_message,supplier)=>{setCreatingSupplier(false);setSupplierNotice('Fornecedor cadastrado: '+supplier.nome);}}/>}
 </>;
}
