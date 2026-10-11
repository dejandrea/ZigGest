import React,{useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import api from '../services/api';
import ComandaIdentityForm from '../components/ComandaIdentityForm';
import ComandaDetails from '../components/ComandaDetails';
import {money} from '../services/finance';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/Comandas.css';
export default function Comandas(){
 const [query]=useSearchParams();
 const [data,setData]=useState({rows:[],customers:[],finance:{methods:[]},sessions:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[creating,setCreating]=useState(false),[selected,setSelected]=useState(()=>query.get('comanda')),[search,setSearch]=useState(''),[status,setStatus]=useState('aberta');
 async function fetchData(){const [rows,customers,finance,sessions]=await Promise.all([api.get('/comandas'),api.get('/clientes'),api.get('/financeiro'),api.get('/caixa')]);return {rows:rows.data,customers:customers.data,finance:finance.data,sessions:sessions.data};}
 async function load(){setLoading(true);setError('');try{setData(await fetchData());}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const session=data.sessions.find(s=>s.status==='OPEN'),current=data.rows.find(row=>row.id===selected);
 const filtered=data.rows.filter(row=>(status==='all'||row.status===status)&&[row.nome_cliente,row.codigo_mesa,row.sale_record].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">FRENTE DE LOJA</p><h1>Comandas</h1><p>Consumo em andamento para clientes cadastrados ou avulsos.</p></div><button className="users-primary" disabled={loading||!session||!!error} onClick={()=>setCreating(true)}>+ Nova comanda</button></header>{error&&<p role="alert" className="users-message users-error">{error}</p>}{!loading&&!session&&!error&&<p className="users-message">Abra o caixa para iniciar o atendimento. <Link to="/caixa">Ir para o caixa</Link></p>}
 <div className="users-toolbar"><input aria-label="Buscar comandas" placeholder="Nome ou número da comanda" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar comandas" value={status} onChange={e=>setStatus(e.target.value)}><option value="aberta">Abertas</option><option value="fechada">Encerradas</option><option value="all">Todas</option></select><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div>
 <div className="comanda-grid">{loading?<p role="status">Carregando comandas…</p>:filtered.length?filtered.map(row=><button className="comanda-card" key={row.id} onClick={()=>setSelected(row.id)}><span>Comanda #{row.sale_record??row.codigo_mesa} · {row.status==='aberta'?'Aberta':'Encerrada'}</span><strong>{row.nome_cliente}</strong><span>{row.customer_codigo?'Cliente #'+row.customer_codigo:'Cliente avulso'}</span><strong>Saldo: {money(Math.max(0,Number(row.total_geral)-Number(row.paid_total??0)))}</strong><span>Consumo: {money(row.total_geral)} · Pago: {money(row.paid_total??0)}</span></button>):<p>Nenhuma comanda encontrada.</p>}</div>
 {creating&&<ComandaIdentityForm customers={data.customers} onClose={()=>setCreating(false)} onSuccess={()=>{setCreating(false);load();}}/>}{current&&<ComandaDetails key={current.id} comanda={current} customers={data.customers} finance={data.finance} session={session} onClose={()=>setSelected(null)} onSaved={load}/>}
 </div>;
}
