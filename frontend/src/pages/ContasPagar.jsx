import React,{useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import api from '../services/api';
import PayableForm from '../components/PayableForm';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/InvoiceEntry.css';
const money=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function ContasPagar(){
 const [params,setParams]=useSearchParams(),sourceId=params.get('entrada');
 const [data,setData]=useState({rows:[],suppliers:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 async function load(){setLoading(true);setError('');try{const [rows,suppliers]=await Promise.all([api.get('/contas-pagar'),api.get('/fornecedores')]);setData({rows:rows.data,suppliers:suppliers.data});}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;setLoading(true);setError('');setEditing(null);
  Promise.all([api.get('/contas-pagar'),api.get('/fornecedores'),sourceId?api.get('/financeiro-entrada/'+encodeURIComponent(sourceId)):Promise.resolve(null)]).then(([rows,suppliers,draft])=>{if(active){setData({rows:rows.data,suppliers:suppliers.data});if(draft)setEditing(draft.data);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[sourceId]);
 function close(){setEditing(null);if(sourceId)setParams({}, {replace:true});}
 function saved(message){close();setNotice(message);load();}
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bahia'});
 const rows=data.rows.flatMap(account=>account.parcelas.map((p,i)=>({...p,account,index:i}))).filter(p=>[p.account.fornecedorNome,p.account.descricao,p.numero].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))&&(filter==='all'||filter==='overdue'&&p.vencimento<today||filter==='future'&&p.vencimento>=today)).sort((a,b)=>a.vencimento.localeCompare(b.vencimento));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">FINANCEIRO</p><h1>Contas a pagar</h1><p>Lançamentos por fornecedor com vencimentos e parcelas editáveis.</p></div><button className="users-primary" disabled={loading} onClick={()=>{setEditing({});setNotice('');}}>+ Nova conta a pagar</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  {error&&sourceId&&<button className="users-secondary" onClick={()=>setParams({},{replace:true})}>Voltar à lista</button>}
  <div className="users-stats"><div><span>Total lançado</span><strong>{money(data.rows.reduce((sum,r)=>sum+Number(r.total),0))}</strong></div><div><span>Parcelas</span><strong>{data.rows.reduce((sum,r)=>sum+r.parcelas.length,0)}</strong></div><div><span>Vencidas</span><strong>{money(data.rows.flatMap(r=>r.parcelas).filter(p=>p.vencimento<today).reduce((sum,p)=>sum+Number(p.valor),0))}</strong></div></div>
  <section className="users-list" aria-label="Contas a pagar" aria-busy={loading}><div className="product-list-heading"><h2>Lançamentos</h2><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div><div className="users-toolbar"><div className="users-search"><input aria-label="Buscar contas a pagar" placeholder="Fornecedor ou descrição" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filtrar vencimentos" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todas as parcelas</option><option value="overdue">Vencidas</option><option value="future">A vencer</option></select></div>
  <div className="users-table-wrap"><table><thead><tr><th>Fornecedor / descrição</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Forma de pagamento</th><th>Ações</th></tr></thead><tbody>{loading?<tr><td colSpan={6}>Carregando…</td></tr>:!rows.length?<tr><td colSpan={6} className="users-empty">Nenhuma conta a pagar encontrada.</td></tr>:rows.map(p=><tr key={p.account.id+':'+p.index}><td><strong>{p.account.fornecedorNome}</strong><div>{p.account.descricao}</div>{p.account.sourceId&&<small>Vinculada à entrada de estoque</small>}</td><td>{p.index+1} / {p.account.parcelas.length}{p.numero&&<div className="inventory-code">Ref. {p.numero}</div>}</td><td>{p.vencimento.split('-').reverse().join('/')}{p.vencimento<today&&<div className="inventory-low">Vencida</div>}</td><td>{money(p.valor)}</td><td>{p.formaPagamento||'Não informada'}</td><td><button className="users-edit" onClick={()=>setEditing(p.account)}>Editar lançamento</button></td></tr>)}</tbody></table></div></section>
  <p className="product-note">Esta etapa registra compromissos a pagar. A baixa de pagamentos, as contas bancárias e as categorias serão configuradas na próxima etapa.</p>
  {editing&&<PayableForm key={editing.id??sourceId??'new'} initialValues={editing} suppliers={data.suppliers} onClose={close} onSuccess={saved}/>}
 </div>;
}
