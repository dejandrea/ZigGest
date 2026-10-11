import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from '../services/supabase';
import {useAuth} from '../auth/AuthContext';
import Icon from '../components/Icon';
import FormModal,{useFormClose} from '../components/FormModal';
import '../styles/pages/Users.css';
const empty={id:null,email:'',nome:'',role:'OPERATOR',enabled:true};
const roles={MASTER:'Master da plataforma',ADMIN:'Administrador',OPERATOR:'Operador'};
export default function Users(){
  const {isMaster,profile}=useAuth();
  const [rows,setRows]=useState([]),[form,setForm]=useState(null);
  const [initialForm,setInitialForm]=useState(null);
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
  const [error,setError]=useState(''),[formError,setFormError]=useState(''),[notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
  async function load(){
    setLoading(true);setError('');
    try{
      const {data,error:queryError}=await supabase.rpc('admin_list_accounts');
      if(queryError)throw new Error('Não foi possível carregar os usuários. Tente atualizar a lista.');
      setRows(data??[]);setLoaded(true);
    }catch(cause){setError(cause.message);}finally{setLoading(false);}
  }
  useEffect(()=>{
    let active=true;
    supabase.rpc('admin_list_accounts').then(({data,error:queryError})=>{
      if(!active)return;
      if(queryError)setError('Não foi possível carregar os usuários. Tente atualizar a lista.');
      else{setRows(data??[]);setLoaded(true);}
    }).catch(()=>{if(active)setError('Não foi possível carregar os usuários. Tente atualizar a lista.');}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  const filtered=useMemo(()=>rows.filter(row=>{
    const text=(row.nome+' '+row.email).toLocaleLowerCase('pt-BR');
    return text.includes(search.trim().toLocaleLowerCase('pt-BR'))&&(filter==='all'||filter==='active'&&row.enabled||filter==='inactive'&&!row.enabled||filter==='pending'&&!row.registered);
  }),[rows,search,filter]);
  function edit(row){setInitialForm({...row});setForm({...row});setFormError('');setNotice('');}
  function cancel(){setForm(null);setFormError('');}
  const dirty=!!form&&JSON.stringify(form)!==JSON.stringify(initialForm);
  const requestClose=useFormClose(cancel,dirty,busy);
  const ownAccount=form?.id===profile?.id;
  async function save(event){
    event.preventDefault();setBusy(true);setFormError('');setNotice('');
    try{
      const {error:saveError}=await supabase.rpc('admin_save_account',{p_id:form.id,p_email:form.email.trim(),p_nome:form.nome.trim(),p_role:form.role,p_enabled:form.enabled});
      if(saveError)throw new Error(saveError.message);
      setForm(null);setNotice('Acesso salvo. Novos usuários devem usar Primeiro acesso e confirmar o e-mail para entrar.');await load();
    }catch(cause){setFormError(cause.message);}finally{setBusy(false);}
  }
  return <div className="users-page">
    <header className="users-heading"><div><p className="home-eyebrow">ADMINISTRAÇÃO</p><h1>Usuários</h1><p>Organize sua equipe e controle quem pode acessar o sistema.</p></div><button className="users-primary" onClick={()=>edit(empty)} disabled={busy}><span aria-hidden="true">+</span> Novo usuário</button></header>
    {notice&&<p className="users-message users-success" role="status">{notice}</p>}
    {error&&<p className="users-message users-error" role="alert">{error}</p>}
    <div className="users-stats" aria-label="Resumo dos usuários">
      {[['Usuários cadastrados',rows.length],['Acessos ativos',rows.filter(r=>r.enabled).length],['Primeiro acesso pendente',rows.filter(r=>!r.registered).length]].map(([label,count])=><div key={label}><span>{label}</span><strong>{loaded?count:'—'}</strong></div>)}
    </div>
    <div className="users-workspace">
      <section className="users-list" aria-label="Lista de usuários" aria-busy={loading}>
        <div className="users-toolbar"><div className="users-search"><Icon name="clients"/><input aria-label="Buscar usuários" placeholder="Buscar por nome ou e-mail" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filtrar acesso" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os acessos</option><option value="active">Ativos</option><option value="inactive">Desativados</option><option value="pending">Cadastro pendente</option></select><button className="users-secondary" onClick={load} disabled={loading||busy}>Atualizar</button></div>
        <div className="users-table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Acesso</th><th>Cadastro</th><th><span className="users-sr-only">Ações</span></th></tr></thead><tbody>
          {loading?<tr><td colSpan="5" className="users-empty"><span role="status">Carregando usuários…</span></td></tr>:!loaded?<tr><td colSpan="5" className="users-empty">A lista está indisponível. Clique em Atualizar para tentar novamente.</td></tr>:filtered.length===0?<tr><td colSpan="5" className="users-empty">{rows.length?'Nenhum usuário corresponde à sua busca.':'Nenhum usuário cadastrado. Comece autorizando um novo acesso.'}</td></tr>:filtered.map(row=><tr key={row.id} className={form?.id===row.id?'is-selected':''}><td><div className="users-person"><span className="users-avatar" aria-hidden="true">{row.nome.trim()[0]?.toUpperCase()||'U'}</span><div><strong>{row.nome}{row.id===profile?.id&&<small className="users-you">Você</small>}</strong><span>{row.email}</span></div></div></td><td><span className={'users-role role-'+row.role.toLowerCase()}>{roles[row.role]||row.role}</span></td><td><span className={'users-status '+(row.enabled?'is-active':'is-inactive')}><i aria-hidden="true"/>{row.enabled?'Ativo':'Desativado'}</span></td><td><span className="users-registration">{row.registered?'Registrado':'Pendente'}</span></td><td><button className="users-edit" aria-label={'Editar '+row.nome} onClick={()=>edit(row)} disabled={busy}>Editar <span aria-hidden="true">↗</span></button></td></tr>)}
        </tbody></table></div>
        <footer className="users-list-footer">{loaded&&!loading?filtered.length+' de '+rows.length+' usuários':'Consulta de acessos'}<span>Perfis e permissões</span></footer>
      </section>
      {form&&<FormModal labelledBy="users-editor-title" onClose={requestClose} dirty={dirty} busy={busy}><section className="users-editor" aria-labelledby="users-editor-title"><div className="users-editor-heading"><div><p className="home-eyebrow">{form.id?'GERENCIAR ACESSO':'NOVO ACESSO'}</p><h2 id="users-editor-title">{form.id?'Editar usuário':'Autorizar usuário'}</h2></div><button aria-label="Fechar formulário" onClick={requestClose} disabled={busy}>×</button></div><p className="users-editor-intro">{form.id?'Atualize o perfil e a disponibilidade do acesso.':'Informe os dados de quem fará parte da sua equipe.'}</p>
        <form onSubmit={save} aria-busy={busy}><fieldset disabled={busy}>
          <label htmlFor="user-name">Nome completo<input id="user-name" autoFocus value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Nome do usuário" required/></label>
          <label htmlFor="user-email">E-mail<input id="user-email" type="email" value={form.email} disabled={!!form.registered} onChange={e=>setForm({...form,email:e.target.value})} placeholder="usuario@empresa.com" required/></label>{form.registered&&<small>O e-mail identifica a conta e não pode ser alterado aqui.</small>}
          <label htmlFor="user-role">Perfil de acesso<select id="user-role" value={form.role} disabled={ownAccount} onChange={e=>setForm({...form,role:e.target.value})}><option value="OPERATOR">Operador</option><option value="ADMIN">Administrador</option>{isMaster&&<option value="MASTER">Master da plataforma</option>}</select></label>
          <p className="users-permission-help">{form.role==='MASTER'?'Acesso completo às operações e à administração da plataforma.':form.role==='ADMIN'?'Gerencia os usuários da empresa e todas as operações.':'Gerencia clientes e operações, sem administrar usuários.'}</p>
          <label className="users-enabled"><div><strong>Acesso ativo</strong><span>{ownAccount?'Seu próprio acesso permanece protegido.':'Desative para impedir o acesso ao sistema.'}</span></div><input type="checkbox" checked={form.enabled} disabled={ownAccount} onChange={e=>setForm({...form,enabled:e.target.checked})}/></label>
        </fieldset>
        {!form.id&&<div className="users-onboarding"><strong>Como funciona o primeiro acesso?</strong><p>Após salvar, o usuário escolhe sua senha em Primeiro acesso e confirma o e-mail. Você não precisa cadastrar uma senha para ele.</p></div>}
        {formError&&<p className="users-message users-error" role="alert">{formError}</p>}
        <div className="users-form-actions"><button type="button" className="users-secondary" onClick={requestClose} disabled={busy}>Cancelar</button><button className="users-primary" disabled={busy}>{busy?'Salvando…':'Salvar acesso'}</button></div>
        </form>
      </section></FormModal>}
    </div>
    <p className="users-bottom-note">Cada pessoa deve utilizar sua própria conta. {isMaster?'O perfil master é exclusivo da administração da plataforma.':'A gestão de usuários master é exclusiva da administração da plataforma.'}</p>
  </div>;
}
