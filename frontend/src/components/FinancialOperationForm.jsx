import React,{useEffect,useRef,useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import {operationTypes,today,money,receivingAccount} from '../services/finance';
export default function FinancialOperationForm({initialValues={},credits=[],onClose,onSuccess}){
 const [initial]=useState(()=>({tipo:'INCOME',valor:'',data:today(),descricao:'',contaId:'',destinoId:'',categoriaId:'',formaId:'',creditoId:'',motivo:'',...initialValues}));
 const [form,setForm]=useState(initial),[config,setConfig]=useState({accounts:[],methods:[],categories:[]}),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState('');
 const {busy,error,run}=useOperation(),request=useRef({});
 const dirty=JSON.stringify(form)!==JSON.stringify(initial),close=useFormClose(onClose,dirty,busy);
 const noCash=['ALLOCATION','REVERSAL'].includes(form.tipo),transfer=form.tipo==='TRANSFER';
 useEffect(()=>{let active=true;if(noCash){setLoading(false);return;}
  api.get('/financeiro').then(({data})=>{if(active){setConfig(data);const method=data.methods.find(m=>m.ativo&&(m.id===initial.formaId||m.nome===initial.paymentName));if(method)setForm(prev=>({...prev,formaId:prev.formaId||method.id,contaId:prev.contaId||receivingAccount(method,data.accounts)}));}}).catch(e=>{if(active)setLoadError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[noCash]);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 function methodChanged(id){const method=config.methods.find(m=>m.id===id);setForm(prev=>({...prev,formaId:id,contaId:receivingAccount(method,config.accounts)||prev.contaId}));}
 async function save(event){event.preventDefault();try{const serialized=JSON.stringify(form);if(request.current.payload!==serialized)request.current={payload:serialized,id:crypto.randomUUID()};
  await run(()=>api.post('/financeiro-movimentacoes',{...form,requestId:request.current.id}));onSuccess('Movimentação financeira registrada com sucesso.');
 }catch{/* Repetição segura sem apagar o formulário. */}}
 const income=['INCOME','RECEIPT'].includes(form.tipo);
 return <FormModal labelledBy="financial-operation-title" dirty={dirty} busy={busy} onClose={close}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="financial-operation-title">{operationTypes[form.tipo]}</h2><button type="button" aria-label="Fechar formulário" onClick={close} disabled={busy}>×</button></div>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{loadError&&<p role="alert" className="users-message users-error">{loadError}</p>}
  {!noCash&&!loading&&!config.accounts.some(a=>a.ativo)&&<p role="status">Um administrador precisa cadastrar uma conta financeira nas configurações antes de movimentar dinheiro.</p>}
  {initial.maxValue!=null&&<p>Saldo disponível para esta baixa: {money(initial.maxValue)}. Você pode baixar uma parte do valor.</p>}
  {form.tipo==='ALLOCATION'&&<p>Vincular um crédito existente reduz o saldo deste débito sem registrar dinheiro novamente.</p>}
  <form onSubmit={save}><fieldset disabled={busy||loading||!!loadError} className="product-fields">
   {form.tipo==='ALLOCATION'&&<label className="product-wide">Crédito do cliente<select required value={form.creditoId} onChange={e=>{const credit=credits.find(c=>c._id===e.target.value);setForm(prev=>({...prev,creditoId:e.target.value,valor:credit?Math.min(credit.aberto,initial.maxValue??credit.aberto).toFixed(2):prev.valor}));}}><option value="">Selecione</option>{credits.map(c=><option key={c._id} value={c._id}>#{c.codigoConta} — {money(c.aberto)}</option>)}</select></label>}
   {form.tipo!=='REVERSAL'&&<label>Valor<input required type="number" min="0.01" max={initial.maxValue??undefined} step="0.01" value={form.valor} onChange={e=>change('valor',e.target.value)}/></label>}
   <label>Data da movimentação<input required type="date" max={today()} min={initial.minDate??undefined} value={form.data} onChange={e=>change('data',e.target.value)}/></label>
   <label className="product-wide">Descrição<input required maxLength={200} value={form.descricao} onChange={e=>change('descricao',e.target.value)}/></label>
   {!noCash&&<>
    {!transfer&&<label className="product-wide">Forma de pagamento<select required value={form.formaId} onChange={e=>methodChanged(e.target.value)}><option value="">Selecione</option>{config.methods.filter(m=>m.ativo).map(m=><option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>}
    <label className="product-wide">{transfer?'Conta de origem':'Conta financeira'}<select required value={form.contaId} onChange={e=>change('contaId',e.target.value)}><option value="">Selecione</option>{config.accounts.filter(a=>a.ativo).map(a=><option key={a.id} value={a.id}>{a.nome} — {money(a.saldo)}</option>)}</select></label>
    {transfer?<label className="product-wide">Conta de destino<select required value={form.destinoId} onChange={e=>change('destinoId',e.target.value)}><option value="">Selecione</option>{config.accounts.filter(a=>a.ativo&&a.id!==form.contaId).map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>:<label className="product-wide">Categoria{['PAYMENT','RECEIPT'].includes(form.tipo)?' (opcional)':''}<select required={['INCOME','EXPENSE'].includes(form.tipo)} value={form.categoriaId} onChange={e=>change('categoriaId',e.target.value)}><option value="">Selecione</option>{config.categories.filter(c=>c.ativo&&(c.natureza==='BOTH'||c.natureza===(income?'INCOME':'EXPENSE'))).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>}
   </>}
   <label className="product-wide">{form.tipo==='REVERSAL'?'Motivo do estorno':'Observações'}<textarea required={form.tipo==='REVERSAL'} minLength={form.tipo==='REVERSAL'?3:undefined} maxLength={2000} value={form.motivo} onChange={e=>change('motivo',e.target.value)}/></label>
   <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button className="users-primary" disabled={loading||!!loadError}>{busy?'Registrando…':form.tipo==='REVERSAL'?'Confirmar estorno':'Registrar movimentação'}</button></div>
  </fieldset></form>
 </div></FormModal>;
}
