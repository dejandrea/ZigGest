import React,{useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from './FormModal';
import useOperation from '../hooks/useOperation';
import '../styles/pages/Users.css';
import '../styles/pages/Fornecedores.css';

const empty={nome:'',nomeFantasia:'',documento:'',contato:'',telefone:'',email:'',endereco:'',observacoes:'',ativo:true};
const fields=[['nome','Nome / razão social'],['nomeFantasia','Nome fantasia'],['documento','CPF / CNPJ'],['contato','Pessoa de contato'],['telefone','Telefone'],['email','E-mail'],['endereco','Endereço']];
export default function SupplierForm({supplier,initialValues={},onClose,onSuccess}){
 const [initial]=useState(()=>Object.fromEntries(Object.keys(empty).map(k=>[k,supplier?.[k]??initialValues[k]??empty[k]])));
 const [form,setForm]=useState(initial);
 const {busy,error,run}=useOperation();
 const dirty=JSON.stringify(form)!==JSON.stringify(initial);
 const close=useFormClose(onClose,dirty,busy);
 async function save(e){
  e.preventDefault();
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
    {fields.map(([key,label])=><label key={key}>{label}<input name={key} value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} type={key==='email'?'email':key==='telefone'?'tel':'text'} required={key==='nome'} maxLength={key==='nome'?200:500} autoFocus={key==='nome'}/></label>)}
    <label className="supplier-wide">Observações<textarea name="observacoes" value={form.observacoes} onChange={e=>setForm({...form,observacoes:e.target.value})} maxLength={2000} rows={3}/></label>
    <label className="supplier-wide">Situação<select value={String(form.ativo)} onChange={e=>setForm({...form,ativo:e.target.value==='true'})}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
    <div className="users-form-actions supplier-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando…':'Salvar fornecedor'}</button></div>
   </fieldset></form>
  </div>
 </FormModal>;
}
