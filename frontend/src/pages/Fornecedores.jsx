import React,{useEffect,useMemo,useState} from 'react';
import api from '../services/api';
import FormModal,{useFormClose} from '../components/FormModal';
import useOperation from '../hooks/useOperation';
import '../styles/pages/Users.css';
import '../styles/pages/Fornecedores.css';

const empty={nome:'',nomeFantasia:'',documento:'',contato:'',telefone:'',email:'',endereco:'',observacoes:'',ativo:true};
const fields=[['nome','Nome / razão social'],['nomeFantasia','Nome fantasia'],['documento','CPF / CNPJ'],['contato','Pessoa de contato'],['telefone','Telefone'],['email','E-mail'],['endereco','Endereço']];
function SupplierForm({supplier,onClose,onSuccess}){
 const [initial]=useState(()=>Object.fromEntries(Object.keys(empty).map(k=>[k,supplier?.[k]??empty[k]])));
 const [form,setForm]=useState(initial);
 const {busy,error,run}=useOperation();
 const dirty=JSON.stringify(form)!==JSON.stringify(initial);
 const close=useFormClose(onClose,dirty,busy);
 async function save(e){
  e.preventDefault();
  const body={...form,nome:form.nome.trim()};
  if(!body.nome)return;
  try{
   await run(()=>supplier?api.put('/fornecedores/'+supplier.codigoFornecedor,body):api.post('/fornecedores',body));
   onSuccess(supplier?'Fornecedor atualizado com sucesso.':'Fornecedor cadastrado com sucesso.');
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
export default function Fornecedores(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[editing,setEditing]=useState(null);
 async function load(){
  setLoading(true);setError('');
  try{const {data}=await api.get('/fornecedores');setRows(data);setLoaded(true);}
  catch{setError('Não foi possível carregar os fornecedores. Tente atualizar a lista.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{let active=true;api.get('/fornecedores').then(({data})=>{if(active){setRows(data);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar os fornecedores. Tente atualizar a lista.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const filtered=useMemo(()=>rows.filter(s=>{
  const term=search.trim().toLocaleLowerCase('pt-BR');
  const text=[s.nome,s.nomeFantasia,s.documento,s.contato,s.email,s.telefone,s.codigoFornecedor].join(' ').toLocaleLowerCase('pt-BR');
  return text.includes(term)&&(filter==='all'||(filter==='active'?s.ativo:!s.ativo));
 }).sort((a,b)=>b.codigoFornecedor-a.codigoFornecedor),[rows,search,filter]);
 return <div className="users-page suppliers-page">
  <header className="users-heading"><div><p className="home-eyebrow">CADASTROS</p><h1>Fornecedores</h1><p>Organize seus parceiros e mantenha os contatos sempre à mão.</p></div><button className="users-primary" onClick={()=>{setEditing({});setNotice('');}}>+ Novo fornecedor</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <div className="users-stats">{[['Fornecedores cadastrados',rows.length],['Fornecedores ativos',rows.filter(s=>s.ativo).length],['Fornecedores inativos',rows.filter(s=>!s.ativo).length]].map(([label,count])=><div key={label}><span>{label}</span><strong>{loaded?count:'—'}</strong></div>)}</div>
  <section className="users-list" aria-label="Lista de fornecedores" aria-busy={loading}>
   <div className="supplier-list-heading"><div><h2>Seus fornecedores</h2><p>Cadastros mais recentes aparecem primeiro.</p></div><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div>
   <div className="users-toolbar"><div className="users-search"><input aria-label="Buscar fornecedores" placeholder="Nome, documento, código ou contato" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filtrar fornecedores" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os fornecedores</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>{(search||filter!=='all')&&<button className="users-edit" onClick={()=>{setSearch('');setFilter('all');}}>Limpar filtros</button>}</div>
   <div className="users-table-wrap"><table><thead><tr><th>Fornecedor</th><th>Documento</th><th>Contato</th><th>Situação</th><th><span className="users-sr-only">Ações</span></th></tr></thead><tbody>
    {loading?<tr><td colSpan={5} className="users-empty">Carregando fornecedores…</td></tr>:!loaded?<tr><td colSpan={5} className="users-empty">Lista indisponível. Clique em Atualizar para tentar novamente.</td></tr>:!filtered.length?<tr><td colSpan={5} className="users-empty">{rows.length?'Nenhum fornecedor corresponde aos filtros.':'Nenhum fornecedor cadastrado. Adicione seu primeiro fornecedor.'}</td></tr>:filtered.map(s=><tr key={s.codigoFornecedor}><td><div className="users-person"><span className="users-avatar" aria-hidden="true">{s.nome[0]?.toUpperCase()}</span><div><strong>{s.nome}</strong><span>#{String(s.codigoFornecedor).padStart(4,'0')}{s.nomeFantasia?' · '+s.nomeFantasia:''}</span></div></div></td><td>{s.documento||'Não informado'}</td><td><div className="supplier-contact"><strong>{s.contato||s.telefone||'Sem contato'}</strong><span>{s.contato?s.telefone:''}</span><span>{s.email}</span></div></td><td><span className={'users-status '+(s.ativo?'is-active':'is-inactive')}><i aria-hidden="true"/>{s.ativo?'Ativo':'Inativo'}</span></td><td><button className="users-edit" aria-label={'Editar fornecedor '+s.nome} onClick={()=>{setEditing(s);setNotice('');}}>Editar ↗</button></td></tr>)}
   </tbody></table></div><footer className="users-list-footer"><span>{loaded&&!loading?filtered.length+' de '+rows.length+' fornecedores':'Consulta de fornecedores'}</span><span>Identificação e contato</span></footer>
  </section>
  <p className="supplier-note">Desative fornecedores sem apagar o histórico. Compras, estoque e contas a pagar serão vinculados nas próximas etapas.</p>
  {editing&&<SupplierForm supplier={editing.codigoFornecedor?editing:null} onClose={()=>setEditing(null)} onSuccess={message=>{setEditing(null);setNotice(message);load();}}/>}
 </div>;
}
