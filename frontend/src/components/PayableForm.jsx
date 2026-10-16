import MoneyInput from './MoneyInput';
import ContactInput from './ContactInput';
import React,{useEffect,useRef,useState} from 'react';
import api from '../services/api';
import {sumMoney} from '../services/decimalMoney';
import {installmentPlan,paymentMethods} from '../services/payables';
import useOperation from '../hooks/useOperation';
import FormModal,{useFormClose} from './FormModal';
import SupplierForm from './SupplierForm';
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'});
export default function PayableForm({initialValues={},suppliers=[],onClose,onSuccess}){
 const [initial]=useState(()=>({...{fornecedorId:'',fornecedorNome:'',fornecedorDocumento:'',descricao:'',total:'',observacoes:''},...initialValues,parcelas:initialValues.parcelas?.length?initialValues.parcelas:[{numero:'1',vencimento:today(),valor:initialValues.total??'',formaPagamento:initialValues.defaultPaymentMethod??''}]}));
 const [form,setForm]=useState(initial),[count,setCount]=useState(String(initial.parcelas.length)),[firstDate,setFirstDate]=useState(initial.parcelas[0].vencimento),[newSupplier,setNewSupplier]=useState(false),[created,setCreated]=useState([]);
 const {busy,error,run,setError}=useOperation(),request=useRef({});
 const [categories,setCategories]=useState([]),[categoryError,setCategoryError]=useState('');
 useEffect(()=>{let active=true;api.get('/financeiro').then(({data})=>{if(active)setCategories(data?.categories??[]);}).catch(()=>{if(active)setCategoryError('Não foi possível carregar as categorias. Você pode salvar sem categoria e ajustá-la depois.');});return()=>{active=false;};},[]);
 const dirty=JSON.stringify(initial)!==JSON.stringify(form),close=useFormClose(onClose,dirty,busy);
 const available=[...suppliers.filter(s=>!created.some(c=>c._id===s._id)),...created];
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 function supplierChanged(id){const s=available.find(s=>s._id===id);setForm(prev=>({...prev,fornecedorId:id,fornecedorNome:s?.nome??prev.fornecedorNome,fornecedorDocumento:s?.documento??prev.fornecedorDocumento}));}
 function generate(){try{const plan=installmentPlan(form.total,count,firstDate);change('parcelas',plan.map(p=>({...p,formaPagamento:form.parcelas[0]?.formaPagamento??''})));setError('');}catch(e){setError(e.message);}}
 function lineChanged(index,key,value){setForm(prev=>({...prev,parcelas:prev.parcelas.map((p,i)=>i===index?{...p,[key]:value}:p)}));}
 let sum='—';try{sum=sumMoney(form.parcelas.map(p=>p.valor)).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:6});}catch{/* Campos ainda incompletos. */}
 async function save(event){event.preventDefault();try{
  const serialized=JSON.stringify(form);if(request.current.payload!==serialized)request.current={payload:serialized,id:crypto.randomUUID()};
  await run(()=>initial.id?api.put('/contas-pagar/'+initial.id,form):api.post('/contas-pagar',{...form,requestId:request.current.id}));
  onSuccess('Conta a pagar salva com sucesso.');
 }catch{/* A entrada de estoque permanece registrada e o formulário financeiro aberto. */}}
 return <><FormModal labelledBy="payable-title" dirty={dirty} busy={busy||newSupplier} onClose={close}><div className="users-editor product-editor invoice-editor">
  <div className="users-editor-heading"><h2 id="payable-title">{initial.id?'Editar conta a pagar':'Nova conta a pagar'}</h2><button type="button" onClick={close} disabled={busy} aria-label="Fechar formulário">×</button></div>
  {initial.sourceId&&<p className="users-editor-intro">Dados preenchidos a partir da entrada. Confira e ajuste antes de salvar.</p>}
  {initial.paymentInfo&&<p className="users-message" role="status">Pagamento informado na NF-e: {initial.paymentInfo}. Confira se há saldo a pagar. Nenhum pagamento é baixado automaticamente.</p>}
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <form onSubmit={save}><fieldset disabled={busy} className="product-fields">
   <label className="product-wide">Fornecedor cadastrado<select value={form.fornecedorId} onChange={e=>supplierChanged(e.target.value)}><option value="">Informar os dados abaixo</option>{available.map(s=><option key={s._id} value={s._id}>{s.nome}{s.ativo?'':' (inativo)'}</option>)}</select></label>
   <button type="button" className="users-secondary product-wide" onClick={()=>setNewSupplier(true)}>Novo fornecedor</button>
   <label>Fornecedor<input required maxLength={200} value={form.fornecedorNome} onChange={e=>{change('fornecedorNome',e.target.value);change('fornecedorId','');}}/></label>
   <label>CPF / CNPJ<ContactInput maxLength={30} value={form.fornecedorDocumento} onChange={e=>{change('fornecedorDocumento',e.target.value);change('fornecedorId','');}}/></label>
   <label className="product-wide">Descrição<input required maxLength={200} value={form.descricao} onChange={e=>change('descricao',e.target.value)}/></label>
   {categoryError&&<p className="product-wide" role="status">{categoryError}</p>}
   <label className="product-wide">Categoria de despesa (opcional)<select value={form.categoriaId??''} onChange={e=>change('categoriaId',e.target.value)}><option value="">Sem categoria</option>{categories.filter(c=>c.ativo&&['EXPENSE','BOTH'].includes(c.natureza)).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
   <label>Valor total<MoneyInput required type="number" min="0.000001" step="0.000001" value={form.total} onChange={e=>change('total',e.target.value)}/></label>
   <label>Número de parcelas<input type="number" min="1" max="120" step="1" value={count} onChange={e=>setCount(e.target.value)}/></label>
   <label>Primeiro vencimento<input type="date" value={firstDate} onChange={e=>setFirstDate(e.target.value)}/></label>
   <button type="button" className="users-secondary" onClick={generate}>Gerar parcelas mensais</button>
   <small className="product-wide">Gerar parcelas substitui os valores e vencimentos abaixo. Você pode editar cada parcela, inclusive quando veio da NF-e.</small>
   <div className="product-wide invoice-items">{form.parcelas.map((p,i)=><section className="invoice-item" key={i}><h3>Parcela {i+1} de {form.parcelas.length}</h3><div className="invoice-line-fields">
    <label>Referência da parcela {i+1}<input maxLength={50} value={p.numero} onChange={e=>lineChanged(i,'numero',e.target.value)}/></label>
    <label>Vencimento da parcela {i+1}<input required type="date" value={p.vencimento} onChange={e=>lineChanged(i,'vencimento',e.target.value)}/></label>
    <label>Valor da parcela {i+1}<MoneyInput required type="number" min="0.000001" step="0.000001" value={p.valor} onChange={e=>lineChanged(i,'valor',e.target.value)}/></label>
    <label>Forma de pagamento da parcela {i+1}<input list="payable-methods" maxLength={100} value={p.formaPagamento} onChange={e=>lineChanged(i,'formaPagamento',e.target.value)}/></label>
   </div></section>)}</div><datalist id="payable-methods">{Object.values(paymentMethods).filter(v=>v!=='Sem pagamento').map(v=><option key={v} value={v}/>)}</datalist>
   <p className="product-wide inventory-preview">Soma das parcelas: {sum}</p>
   <label className="product-wide">Observações<textarea maxLength={2000} value={form.observacoes} onChange={e=>change('observacoes',e.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando…':'Salvar conta a pagar'}</button></div>
  </fieldset></form>
 </div></FormModal>{newSupplier&&<SupplierForm initialValues={{nome:form.fornecedorNome,documento:form.fornecedorDocumento}} onClose={()=>setNewSupplier(false)} onSuccess={(_message,supplier,keepOpen)=>{setCreated(prev=>[...prev,supplier]);setForm(prev=>({...prev,fornecedorId:supplier._id,fornecedorNome:supplier.nome,fornecedorDocumento:supplier.documento}));if(!keepOpen)setNewSupplier(false);}}/>}</>;
}
