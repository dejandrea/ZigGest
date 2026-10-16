import ContactInput from './ContactInput';
import MoneyInput from './MoneyInput';
function InvoiceFieldInput({field,...props}){
 return ['unitPrice','total'].includes(field)?<MoneyInput {...props} decimalPlaces={field==='unitPrice'?6:2}/>:<input {...props}/>;
}
import React,{useEffect,useRef,useState} from 'react';
import {multiplyMoney} from '../services/decimalMoney';
import useInvoiceParties from '../hooks/useInvoiceParties';
import InvoicePartyPicker from './InvoicePartyPicker';
import RecipientForm from './RecipientForm';
import {matchInvoiceParty,matchInvoiceName} from '../services/recipients';
import InvoiceTotals from './InvoiceTotals';
import {invoiceTotals} from '../services/invoiceTotals';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import {StockItemForm} from './InventoryForms';
import SupplierForm from './SupplierForm';
import {localDateTime} from '../services/nfe';
import useOperation from '../hooks/useOperation';
import '../styles/pages/InvoiceEntry.css';
const emptyHeader={number:'',series:'1',issuerName:'',issuerDocument:'',issuedAt:'',total:'',recipientName:'',recipientDocument:'',frete:'0',descontos:'0',impostos:'0',acrescimos:'0'};
const blank=id=>({id,name:'',code:'',unit:'UN',invoiceQuantity:'1',unitPrice:'0',total:'0',stockItemId:'',quantity:'1',factor:'1'});
export default function ManualInvoiceEntryForm({items,onClose,onXml,onItemCreated=()=>{},initialInvoice=null}){
 const parties=useInvoiceParties(),[newRecipient,setNewRecipient]=useState(false),fiscalReadOnly=initialInvoice?.origem==='XML';
 const [header,setHeader]=useState(()=>initialInvoice?{number:initialInvoice.numero,series:initialInvoice.serie,issuerName:initialInvoice.emitente_nome,issuerDocument:initialInvoice.emitente_documento,issuedAt:localDateTime(initialInvoice.emitida_em),total:String(initialInvoice.total),recipientName:initialInvoice.destinatario_nome,recipientDocument:initialInvoice.destinatario_documento,frete:String(initialInvoice.frete??0),descontos:String(initialInvoice.descontos??0),impostos:String(initialInvoice.impostos??0),acrescimos:String(initialInvoice.acrescimos??0)}:emptyHeader),[lines,setLines]=useState(()=>initialInvoice?initialInvoice.itens.map((i,index)=>({id:index+1,name:i.descricao,code:i.codigo,unit:i.unidade_nf,invoiceQuantity:String(i.quantidade_nf),unitPrice:String(i.valor_unitario),total:String(i.valor_total),stockItemId:i.stock_item_id,quantity:String(i.quantidade_recebida),factor:String(i.fator)})):[blank(1)]),[arrival,setArrival]=useState(()=>initialInvoice?localDateTime(initialInvoice.movement.ocorrido_em):''),[notes,setNotes]=useState(initialInvoice?.movement.observacoes??''),[createdItems,setCreatedItems]=useState([]),[newItemId,setNewItemId]=useState(null),[newSupplier,setNewSupplier]=useState(false);
 const {busy,error,run}=useOperation(),request=useRef({}),nextId=useRef((initialInvoice?.itens.length??1)+1);
 const initialSnapshot=useRef(JSON.stringify({header,lines,arrival,notes}));
 const dirty=JSON.stringify({header,lines,arrival,notes})!==initialSnapshot.current;
 const close=useFormClose(onClose,dirty,busy),switchMode=useFormClose(onXml,dirty,busy);
 const active=[...items.filter(i=>!createdItems.some(c=>c._id===i._id)),...createdItems].filter(i=>i.ativo);
 const selected=lines.find(l=>l.id===newItemId);
 function changeHeader(field,value){setHeader(h=>{
  const updated={...h,[field]:value},supplier=field==='issuerDocument'?matchInvoiceParty(parties.suppliers,value):field==='issuerName'?matchInvoiceName(parties.suppliers,value):null;
  const recipient=field==='recipientDocument'?matchInvoiceParty(parties.recipients,value):field==='recipientName'?matchInvoiceName(parties.recipients,value):null;
  if(field==='issuerDocument'&&!supplier&&matchInvoiceParty(parties.suppliers,h.issuerDocument)?.nome===h.issuerName)updated.issuerName='';
  if(field==='recipientDocument'&&!recipient&&matchInvoiceParty(parties.recipients,h.recipientDocument)?.nome===h.recipientName)updated.recipientName='';
  if(supplier&&supplier.ativo){updated.issuerName=supplier.nome;updated.issuerDocument=supplier.documento;}
  if(recipient&&recipient.ativo){updated.recipientName=recipient.nome;updated.recipientDocument=recipient.documento;}
  return updated;
 });}
 useEffect(()=>{if(fiscalReadOnly)return;setHeader(previous=>{
  const supplier=matchInvoiceParty(parties.suppliers,previous.issuerDocument),recipient=matchInvoiceParty(parties.recipients,previous.recipientDocument);
  return {...previous,...(!previous.issuerName&&supplier?.ativo?{issuerName:supplier.nome}:{}),...(!previous.recipientName&&recipient?.ativo?{recipientName:recipient.nome}:{})};
 });},[parties.suppliers,parties.recipients,fiscalReadOnly]);
 function change(id,field,value){setLines(prev=>prev.map(l=>{if(l.id!==id)return l;const updated={...l,[field]:value};if(['unitPrice','invoiceQuantity'].includes(field)){try{updated.total=multiplyMoney(updated.invoiceQuantity,updated.unitPrice);}catch{updated.total='';}}return updated;}));}
 async function save(event){event.preventDefault();const totals=invoiceTotals(header.total,lines,header);const warning=totals.matches===false?'Os totais est\u00e3o divergentes: nota R$ '+header.total+'; itens R$ '+totals.sum+'; total com ajustes R$ '+totals.calculated+'; diferen\u00e7a R$ '+totals.difference+'. Confira descontos, frete e impostos.\n\n':'';if(!window.confirm(warning+(initialInvoice?'Confirmar as altera\u00e7\u00f5es da nota? O estoque e o financeiro vinculado ser\u00e3o atualizados.':'Voc\u00ea finalizou a confer\u00eancia e deseja registrar a entrada da nota?')))return;try{await run(async()=>{
  const body={header:initialInvoice?.origem==='XML'?{...header,issuedAt:initialInvoice.emitida_em}:header,lines,dataEntrada:arrival,observacoes:notes},serialized=JSON.stringify(body);
  if(request.current.body!==serialized)request.current={body:serialized,id:crypto.randomUUID()};
  return initialInvoice?api.put('/entradas-nfe/'+initialInvoice.id,{...body,requestId:request.current.id,revision:initialInvoice.revision}):api.post('/entradas-nfe-manual',{...body,requestId:request.current.id});
 }).then(({data})=>onClose(initialInvoice?'Nota, estoque e financeiro vinculado atualizados com sucesso.':'Nota manual registrada e estoque atualizado com sucesso.',{sourceId:data.id??request.current.id}));}catch{/* Preserva os campos e o pedido para repetição segura. */}}
 return <><FormModal labelledBy="manual-invoice-title" dirty={dirty} busy={busy||newItemId!==null||newSupplier||newRecipient} onClose={close}><div className="users-editor product-editor invoice-editor">
  <div className="users-editor-heading"><h2 id="manual-invoice-title">{initialInvoice?'Editar entrada da NF-e':'Entrada de NF-e manual'}</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  <p className="users-editor-intro">{initialInvoice?'Confira os dados. As parcelas vinculadas ser\u00e3o ajustadas, preservando vencimentos, formas de pagamento e baixas realizadas. O XML original permanece preservado.':'Digite os dados da nota e dos itens. XML e chave de acesso n\u00e3o s\u00e3o necess\u00e1rios.'}</p>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  {parties.loading&&<p role="status">Carregando fornecedores e destinatários…</p>}{parties.errors.length>0&&<p role="alert" className="users-message users-error">{parties.errors.join(' ')} Você pode preencher manualmente. <button type="button" onClick={parties.refresh}>Tentar carregar cadastros</button></p>}
  <datalist id="invoice-supplier-names">{parties.suppliers.filter(row=>row.ativo).map(row=><option key={row._id} value={row.nome}/>)}</datalist><datalist id="invoice-recipient-names">{parties.recipients.filter(row=>row.ativo).map(row=><option key={row._id} value={row.nome}/>)}</datalist><form onSubmit={save}><fieldset className="product-fields" disabled={busy}>
   {!initialInvoice&&<label className="product-wide">Forma de entrada<select value="manual" onChange={switchMode}><option value="xml">Importar XML</option><option value="manual">Digitar nota manualmente</option></select></label>}
   <section className="product-wide invoice-section"><h3>Dados da NF-e</h3><div className="invoice-header-grid">
    {[['number','Número da nota'],['series','Série'],['issuedAt','Data de emissão']].map(([field,label])=><label key={field} className={field==='issuedAt'?'invoice-span-2':''}>{label}<input list={field==='issuerName'?'invoice-supplier-names':field==='recipientName'?'invoice-recipient-names':undefined} readOnly={initialInvoice?.origem==='XML'} required type={field==='issuedAt'?'datetime-local':'text'} maxLength={field==='number'?9:field==='series'?3:undefined} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/></label>)}
   </div></section>
   <section className="product-wide invoice-section"><div className="invoice-section-heading"><h3>Fornecedor / emitente</h3><button type="button" className="users-secondary" onClick={()=>setNewSupplier(true)}>Novo fornecedor</button></div><InvoicePartyPicker rows={parties.suppliers} document={header.issuerDocument} label="Fornecedor" readOnly={fiscalReadOnly} onSelect={supplier=>setHeader(previous=>({...previous,issuerName:supplier?.nome??'',issuerDocument:supplier?.documento??''}))}/><div className="invoice-party-grid">
    {[['issuerDocument','CPF / CNPJ do fornecedor'],['issuerName','Nome / razão social do fornecedor']].map(([field,label])=><label key={field}>{label}{field==='issuerDocument'?<ContactInput readOnly={initialInvoice?.origem==='XML'} required maxLength={field==='issuerName'?200:18} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/>:<input list={field==='issuerName'?'invoice-supplier-names':field==='recipientName'?'invoice-recipient-names':undefined} readOnly={initialInvoice?.origem==='XML'} required maxLength={field==='issuerName'?200:18} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/>}</label>)}
   </div></section>
   <section className="product-wide invoice-section"><div className="invoice-section-heading"><h3>Destinatário</h3><button type="button" className="users-secondary" onClick={()=>setNewRecipient(true)}>Novo destinatário</button></div><InvoicePartyPicker rows={parties.recipients} document={header.recipientDocument} label="Destinatário" readOnly={fiscalReadOnly} onSelect={recipient=>setHeader(previous=>({...previous,recipientName:recipient?.nome??'',recipientDocument:recipient?.documento??''}))}/><div className="invoice-party-grid">
    {[['recipientDocument','CPF / CNPJ do destinatário (opcional)'],['recipientName','Destinatário (opcional)']].map(([field,label])=><label key={field}>{label}{field==='recipientDocument'?<ContactInput readOnly={initialInvoice?.origem==='XML'} maxLength={field==='recipientName'?200:18} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/>:<input list={field==='issuerName'?'invoice-supplier-names':field==='recipientName'?'invoice-recipient-names':undefined} readOnly={initialInvoice?.origem==='XML'} maxLength={field==='recipientName'?200:18} value={header[field]} onChange={e=>changeHeader(field,e.target.value)}/>}</label>)}
   </div></section>
   <div className="product-wide invoice-section-heading"><h3>Produtos / insumos</h3></div>
   <div className="product-wide invoice-items">{lines.map((line,index)=>{
    const stock=active.find(i=>i._id===line.stockItemId),delta=Number(line.quantity)*Number(line.factor);
    return <section key={line.id} className="invoice-item"><div className="invoice-section-heading"><h4>Item {index+1}</h4><button type="button" className="users-edit" disabled={lines.length===1} onClick={()=>setLines(prev=>prev.filter(l=>l.id!==line.id))}>Remover item {index+1}</button></div><div className="invoice-product-grid">
     {[['name','Descrição'],['code','Código (opcional)'],['unit','Unidade na nota'],['invoiceQuantity','Quantidade na nota'],['unitPrice','Valor unitário'],['total','Valor total']].map(([field,label])=><label key={field} className={'invoice-field-'+field}>{label}<InvoiceFieldInput field={field} aria-label={label+' do item '+(index+1)} required={field!=='code'} type={['invoiceQuantity','unitPrice','total','quantity','factor'].includes(field)?'number':'text'} min={['unitPrice','total'].includes(field)?'0':'0.001'} step={fiscalReadOnly&&field==='unitPrice'?'0.0000000001':initialInvoice&&field==='invoiceQuantity'?'0.0001':['unitPrice','total'].includes(field)?'0.000001':'0.001'} maxLength={field==='unit'?10:field==='name'?200:100} value={line[field]} onChange={e=>change(line.id,field,e.target.value)}/></label>)}
    </div><div className="invoice-conversion-grid"><label>Insumo do item {index+1}<select required value={line.stockItemId} onChange={e=>change(line.id,'stockItemId',e.target.value)}><option value="">Selecione o insumo</option>{active.map(i=><option key={i._id} value={i._id}>{i.nome} / {i.unidade}</option>)}</select></label>
     {[['quantity','Quantidade recebida'],['factor','Unidades por embalagem']].map(([field,label])=><label key={field}>{label}<InvoiceFieldInput field={field} aria-label={label+' do item '+(index+1)} required type="number" min="0.001" step="0.001" value={line[field]} onChange={e=>change(line.id,field,e.target.value)}/></label>)}
    </div><div className="invoice-item-footer"><p className="inventory-preview">Entrada do item {index+1}: {Number.isFinite(delta)?delta.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—'} {stock?.unidade??'unidades'}</p><button type="button" className="users-secondary" onClick={()=>setNewItemId(line.id)}>Novo insumo para o item {index+1}</button></div></section>;
   })}</div>
   <div className="product-wide invoice-actions"><button type="button" className="users-secondary" disabled={lines.length>=990} onClick={()=>setLines(prev=>[...prev,blank(nextId.current++)])}>Adicionar item</button></div>
   <InvoiceTotals adjustments={header} onAdjustmentChange={changeHeader} total={header.total} items={lines} onChange={value=>changeHeader('total',value)}/>
   <section className="product-wide invoice-section"><h3>Recebimento</h3><div className="invoice-receipt-grid"><label>Data de entrada (opcional)<input type="datetime-local" value={arrival} onChange={e=>setArrival(e.target.value)}/><small>Pode ser retroativa. Em branco, usa o momento do registro.</small></label><label>Observações da entrada<textarea maxLength={2000} rows={2} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div></section>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando\u2026':initialInvoice?'Salvar altera\u00e7\u00f5es':'Registrar nota manual'}</button></div>
  </fieldset></form>
 </div></FormModal>
 {selected&&<StockItemForm initialValues={{nome:selected.name}} onClose={()=>setNewItemId(null)} onSuccess={(_message,item,keepOpen)=>{setCreatedItems(prev=>[...prev,item]);onItemCreated(item);if(item.ativo)change(newItemId,'stockItemId',item._id);if(!keepOpen)setNewItemId(null);}}/>}
 {newSupplier&&<SupplierForm initialValues={{nome:header.issuerName,documento:header.issuerDocument}} onClose={()=>setNewSupplier(false)} onSuccess={(_message,supplier,keepOpen)=>{parties.supplierSaved(supplier);if(!fiscalReadOnly)setHeader(h=>({...h,issuerName:supplier.nome,issuerDocument:supplier.documento}));if(!keepOpen)setNewSupplier(false);}}/>}
 {newRecipient&&<RecipientForm initialValues={{nome:header.recipientName,documento:header.recipientDocument}} onClose={()=>setNewRecipient(false)} onSuccess={(_message,recipient,keepOpen)=>{parties.recipientSaved(recipient);if(!fiscalReadOnly)setHeader(previous=>({...previous,recipientName:recipient.nome,recipientDocument:recipient.documento}));if(!keepOpen)setNewRecipient(false);}}/>}
 </>;
}
