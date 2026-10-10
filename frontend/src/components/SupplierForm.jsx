import React,{useEffect,useRef,useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import {lookupSupplier,normalizeCnpj,validCnpj} from '../services/supplierLookup';
import '../styles/pages/Users.css';
import '../styles/pages/Fornecedores.css';

const empty={nome:'',nomeFantasia:'',documento:'',contato:'',telefone:'',email:'',endereco:'',observacoes:'',ativo:true};
const fields=[['nome','Nome / razão social'],['nomeFantasia','Nome fantasia'],['documento','CPF / CNPJ'],['contato','Pessoa de contato'],['telefone','Telefone'],['email','E-mail'],['endereco','Endereço']];
export default function SupplierForm({supplier,initialValues={},onClose,onSuccess}){
 const [initial]=useState(()=>Object.fromEntries(Object.keys(empty).map(k=>[k,supplier?.[k]??initialValues[k]??empty[k]])));
 const [form,setForm]=useState(initial);
 const {busy,error,run}=useOperation();
 const [looking,setLooking]=useState(false),[lookupNotice,setLookupNotice]=useState('');
 const lookup=useRef({revision:0,controller:null,last:''});
 useEffect(()=>()=>{lookup.current.revision++;lookup.current.controller?.abort();},[]);
 function change(field,value){
  if(field==='documento'){lookup.current.revision++;lookup.current.controller?.abort();lookup.current.last='';setLooking(false);setLookupNotice('');}
  setForm(prev=>({...prev,[field]:value}));
 }
 async function consult(force=false){
  const cnpj=normalizeCnpj(form.documento);
  if(!force&&(cnpj.length!==14||lookup.current.last===cnpj))return;
  if(!validCnpj(cnpj)){setLookupNotice('CNPJ inválido para consulta. Confira o documento ou preencha manualmente.');return;}
  lookup.current.controller?.abort();const controller=new AbortController(),revision=++lookup.current.revision;
  lookup.current.controller=controller;lookup.current.last=cnpj;setLooking(true);setLookupNotice('Consultando CNPJ…');
  try{
   const data=await lookupSupplier(cnpj,{signal:controller.signal});
   if(revision!==lookup.current.revision)return;
   setForm(prev=>normalizeCnpj(prev.documento)===cnpj?Object.fromEntries(Object.entries(prev).map(([field,value])=>[field,typeof value==='string'&&!value.trim()&&data[field]?data[field].slice(0,field==='nome'?200:500):value])):prev);
   setLookupNotice('Consulta concluída pela BrasilAPI. Os campos vazios foram preenchidos com os dados disponíveis; confira antes de salvar.');
  }catch(cause){if(revision===lookup.current.revision)setLookupNotice(cause.message);}
  finally{if(revision===lookup.current.revision)setLooking(false);}
 }
 const dirty=JSON.stringify(form)!==JSON.stringify(initial);
 const close=useFormClose(onClose,dirty,busy);
 async function save(e){
  e.preventDefault();
  lookup.current.revision++;lookup.current.controller?.abort();setLooking(false);setLookupNotice('');
  const body={...form,nome:form.nome.trim()};
  if(!body.nome)return;
  try{
   const {data}=await run(()=>supplier?api.put('/fornecedores/'+supplier.codigoFornecedor,body):api.post('/fornecedores',body));
   onSuccess(supplier?'Fornecedor atualizado com sucesso.':'Fornecedor cadastrado com sucesso.',data);
  }catch{/* useOperation mantém a mensagem e os dados do formulário */}
 }
 return <FormModal labelledBy="supplier-title" onClose={close} dirty={dirty} busy={busy}>
  <div className="users-editor supplier-editor">
   <div className="users-editor-heading"><div><p className="home-eyebrow">CADASTROS</p><h2 id="supplier-title">{supplier?'Editar fornecedor':'Novo fornecedor'}</h2></div><button type="button" className="users-edit" onClick={close} disabled={busy} aria-label="Fechar formulário">×</button></div>
   <p className="users-editor-intro">Dados de identificação e contato. O nome é obrigatório.</p>
   {error&&<p className="users-message users-error" role="alert">{error}</p>}
   <form onSubmit={save}><fieldset disabled={busy} className="supplier-fields">
    {fields.map(([key,label])=><label key={key}>{label}<input name={key} value={form[key]} onChange={e=>change(key,e.target.value)} onBlur={key==='documento'?()=>consult():undefined} type={key==='email'?'email':key==='telefone'?'tel':'text'} required={key==='nome'} maxLength={key==='nome'?200:500} autoFocus={key==='nome'}/></label>)}
    <div className="supplier-wide"><button type="button" className="users-secondary" disabled={looking} onClick={()=>consult(true)}>{looking?'Consultando…':'Consultar CNPJ'}</button>{lookupNotice&&<p role="status" className="supplier-note">{lookupNotice}</p>}<p className="supplier-note">Consulta disponível para CNPJ numérico. Dados não encontrados podem ser preenchidos manualmente; CPF permanece manual.</p></div>
    <label className="supplier-wide">Observações<textarea name="observacoes" value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} maxLength={2000} rows={3}/></label>
    <label className="supplier-wide">Situação<select value={String(form.ativo)} onChange={e=>setForm({...form,ativo:e.target.value==='true'})}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
    <div className="users-form-actions supplier-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando…':'Salvar fornecedor'}</button></div>
   </fieldset></form>
  </div>
 </FormModal>;
}
