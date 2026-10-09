import React,{useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import AccountEditor from '../components/AccountEditor';
import '../styles/pages/Users.css';
import '../styles/pages/Contas.css';
const currency=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export function ledgerSummary(rows){
  const debit=Math.round(rows.filter(r=>r.tipo==='debito').reduce((n,r)=>n+Math.round(Number(r.valor)*100),0));
  const credit=Math.round(rows.filter(r=>r.tipo==='credito').reduce((n,r)=>n+Math.round(Number(r.valor)*100),0));
  return {debit:debit/100,credit:credit/100,balance:(debit-credit)/100};
}
export function accountDate(value){
  if(!value)return '—';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia'}).format(date);
}
function dateKey(value){
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Bahia',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(key=>parts.find(p=>p.type===key).value).join('-');
}
export default function Contas(){
  const navigate=useNavigate();
  const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[editor,setEditor]=useState(null);
  const [search,setSearch]=useState(''),[type,setType]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState('');
  async function load(){
    setLoading(true);setError('');
    try{const {data}=await api.get('/contas');setRows(data);setLoaded(true);}
    catch{setError('Não foi possível carregar os lançamentos. Tente atualizar a lista.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{let active=true;api.get('/contas').then(({data})=>{if(active){setRows(data);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar os lançamentos. Tente atualizar a lista.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const ordered=useMemo(()=>[...rows].sort((a,b)=>{
    const latest=row=>{const time=Date.parse(row.dataLancamento||row.createdAt||'');return Number.isFinite(time)?time:0;};
    return latest(b)-latest(a)||Number(b.codigoConta)-Number(a.codigoConta);
  }),[rows]);
  const filtered=useMemo(()=>ordered.filter(row=>{
    const day=dateKey(row.dataVencimento);
    return [row.clienteNome,row.codigoCliente,row.codigoConta].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))&&(type==='all'||row.tipo===type)&&(!from||day&&day>=from)&&(!to||day&&day<=to);
  }),[ordered,search,type,from,to]);
  const totals=ledgerSummary(rows),visible=ledgerSummary(filtered);
  function open(row){setEditor(row);setNotice('');}
  function saved(message){setEditor(null);setNotice(message);load();}
  const invalidRange=from&&to&&from>to;
  return <div className="users-page accounts-page">
    <header className="users-heading"><div><p className="home-eyebrow">FINANCEIRO</p><h1>Contas a receber</h1><p>Acompanhe os débitos, créditos e o saldo dos seus clientes.</p></div><div className="accounts-heading-actions"><button className="users-secondary" onClick={()=>navigate('/resumo')}>Resumo por cliente <span aria-hidden="true">↗</span></button><button className="users-primary" onClick={()=>open({})}>+ Novo lançamento</button></div></header>
    {error&&<p className="users-message users-error" role="alert">{error}</p>}{notice&&<p className="users-message users-success" role="status">{notice}</p>}
    <div className="users-stats accounts-stats" aria-label="Resumo financeiro">{[['Total de débitos',totals.debit,'debit'],['Total de créditos',totals.credit,'credit'],['Saldo dos lançamentos',totals.balance,'balance']].map(([label,value,kind])=><div className={'accounts-stat '+kind} key={kind}><div><span>{label}</span><Icon name="money"/></div><strong>{loaded?currency.format(value):'—'}</strong><small>{kind==='balance'?'Débitos menos créditos':'Todos os lançamentos cadastrados'}</small></div>)}</div>
    <div className="users-workspace">
      <section className="users-list accounts-list" aria-label="Lista de lançamentos" aria-busy={loading}>
        <div className="accounts-list-heading"><div><h2>Lançamentos</h2><p>Consulte e organize as movimentações dos clientes.</p></div><button className="users-secondary" onClick={load} disabled={loading}>Atualizar</button></div>
        <div className="users-toolbar accounts-toolbar"><div className="users-search"><Icon name="clients"/><input aria-label="Buscar lançamentos" placeholder="Cliente ou código do lançamento" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Tipo de lançamento" value={type} onChange={e=>setType(e.target.value)}><option value="all">Todos os tipos</option><option value="debito">Débitos</option><option value="credito">Créditos</option></select><div className="accounts-date-filter"><label htmlFor="accounts-from">Vencimento de</label><input id="accounts-from" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div><div className="accounts-date-filter"><label htmlFor="accounts-to">Até</label><input id="accounts-to" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>{(search||type!=='all'||from||to)&&<button className="users-edit" onClick={()=>{setSearch('');setType('all');setFrom('');setTo('');}}>Limpar filtros</button>}</div>
        {invalidRange&&<p className="accounts-filter-error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
        <div className="users-table-wrap"><table><thead><tr><th>Código</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Vencimento</th><th><span className="users-sr-only">Ações</span></th></tr></thead><tbody>
          {loading?<tr><td colSpan="6" className="users-empty"><span role="status">Carregando lançamentos…</span></td></tr>:!loaded?<tr><td colSpan="6" className="users-empty">A lista está indisponível. Clique em Atualizar para tentar novamente.</td></tr>:!filtered.length?<tr><td colSpan="6" className="users-empty">{rows.length?'Nenhum lançamento corresponde aos filtros.':'Nenhum lançamento cadastrado. Registre o primeiro lançamento para começar.'}</td></tr>:filtered.map(row=><tr key={row.codigoConta} className={editor?.codigoConta===row.codigoConta?'is-selected':''}><td className="accounts-code">#{String(row.codigoConta).padStart(4,'0')}</td><td><div className="accounts-customer"><strong>{row.clienteNome}</strong><span>Cliente #{row.codigoCliente}</span></div></td><td><span className={'accounts-type '+row.tipo}>{row.tipo==='credito'?'Crédito':'Débito'}</span></td><td className={'accounts-money '+row.tipo}>{currency.format(row.valor)}</td><td>{accountDate(row.dataVencimento)}</td><td><button className="users-edit" aria-label={'Editar lançamento '+row.codigoConta} onClick={()=>open(row)}>Editar <span aria-hidden="true">↗</span></button></td></tr>)}
        </tbody></table></div><footer className="users-list-footer"><span>{loaded&&!loading?filtered.length+' de '+rows.length+' lançamentos':'Consulta de lançamentos'}</span><span className="accounts-filtered-total">{loaded&&!loading?'Saldo da seleção: '+currency.format(visible.balance):''}</span></footer>
      </section>
      {editor&&<AccountEditor key={editor.codigoConta||'new'} conta={editor.codigoConta?editor:null} onClose={()=>setEditor(null)} onSuccess={saved}/>}
    </div>
    <p className="users-bottom-note">Os totais são calculados pelos lançamentos. Créditos reduzem o saldo do cliente; débitos aumentam o saldo.</p>
  </div>;
}
