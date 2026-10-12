import React,{useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import api from '../services/api';
import ComandaIdentityForm from '../components/ComandaIdentityForm';
import ComandaDetails from '../components/ComandaDetails';
import {money} from '../services/finance';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/Comandas.css';
import '../styles/pages/Pos.css';
export default function Comandas({pdv=false}){
 const [query]=useSearchParams();
 const navigate=useNavigate(),request=useRef(crypto.randomUUID());
 const [opening,setOpening]=useState(false);
 const [data,setData]=useState({rows:[],customers:[],products:[],finance:{methods:[]},sessions:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[creating,setCreating]=useState(false),[selected,setSelected]=useState(()=>query.get('comanda')),[search,setSearch]=useState(''),[status,setStatus]=useState('aberta');
 async function fetchData(){const [rows,customers,finance,sessions,products]=await Promise.all([api.get('/comandas'),api.get('/clientes'),api.get('/financeiro'),api.get('/caixa'),api.get('/produtos')]);return {rows:rows.data,customers:customers.data,finance:finance.data,sessions:sessions.data,products:products.data};}
 async function load(){setLoading(true);setError('');try{setData(await fetchData());}catch(e){setError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const session=data.sessions.find(s=>s.status==='OPEN'),current=data.rows.find(row=>row.id===selected);
 async function newSale(){
  setOpening(true);setError('');
  try{const {data:row}=await api.post('/comandas',{id:request.current,action:'OPEN_PDV',data:{identificacao:'Venda avulsa',customer_codigo:null}});setData(previous=>({...previous,rows:[...previous.rows.filter(saved=>saved.id!==row.id),{...row,itens:row.itens??[],pagamentos:row.pagamentos??[]}]}));setSelected(row.id);request.current=crypto.randomUUID();await load();}catch(cause){setError(cause.message);}finally{setOpening(false);}
 }
 const filtered=data.rows.filter(row=>(row.origem??'COMANDA')===(pdv?'PDV':'COMANDA')&&(status==='all'||row.status===status)&&[row.nome_cliente,row.codigo_mesa,row.sale_record].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 return <div className="users-page products-page pos-page">{!current&&<header className="users-heading"><div><p className="home-eyebrow">FRENTE DE LOJA</p><h1>{pdv?'PDV':'Comandas'}</h1><p>{pdv?'Venda direta: adicione produtos, receba e finalize ou envie para uma comanda.':'Consumo em andamento para clientes cadastrados ou avulsos.'}</p></div><button className="users-primary" disabled={loading||opening||!session} onClick={()=>pdv?newSale():setCreating(true)}>{pdv?'+ Nova venda':'+ Nova comanda'}</button><button className="users-secondary" onClick={()=>navigate('/')}>Voltar ao sistema</button></header>}{error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message">{notice} {notice.includes('comanda #')&&<Link to="/comandas">Ir para comandas</Link>}</p>}{!loading&&!session&&!error&&<p className="users-message">Abra o caixa para iniciar o atendimento. <Link to="/caixa">Ir para o caixa</Link></p>}
 {!current&&<><div className="users-toolbar"><input aria-label="Buscar comandas" placeholder="Nome ou número da comanda" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar comandas" value={status} onChange={e=>setStatus(e.target.value)}><option value="aberta">{pdv?'Em atendimento':'Abertas'}</option><option value="fechada">{pdv?'Finalizadas / transferidas':'Encerradas'}</option><option value="all">Todas</option></select><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div>
 <div className="comanda-grid pos-session-list">{loading?<p role="status">Carregando comandas…</p>:filtered.length?filtered.map(row=><button className="comanda-card" key={row.id} onClick={()=>setSelected(row.id)}><span>{pdv?'Venda':'Comanda'} #{row.sale_record??row.codigo_mesa} · {row.status==='aberta'?(pdv?'Em atendimento':'Aberta'):row.sale_id?'Finalizada':pdv?'Transferida':'Encerrada'}</span><strong>{row.nome_cliente}</strong><span>{row.customer_codigo?'Cliente #'+row.customer_codigo:'Cliente avulso'}</span><strong>Saldo: {money(Math.max(0,Number(row.total_geral)-Number(row.paid_total??0)))}</strong><span>Consumo: {money(row.total_geral)} · Pago: {money(row.paid_total??0)}</span></button>):<p>{pdv?'Nenhuma venda encontrada.':'Nenhuma comanda encontrada.'}</p>}</div></>}
 {creating&&<ComandaIdentityForm pdv={pdv} customers={data.customers} onClose={()=>setCreating(false)} onSuccess={row=>{setCreating(false);setSelected(row.id);load();}}/>}{current&&<ComandaDetails refreshing={loading} workstation onExit={()=>navigate('/')} key={current.id} comanda={current} comandas={data.rows} products={data.products} customers={data.customers} finance={data.finance} session={session} onClose={()=>setSelected(null)} onSaved={load} onFinalized={result=>setNotice('Venda #'+result.sale_record+' finalizada.')} onTransferred={result=>setNotice('Itens enviados para a comanda #'+result.comanda_numero+'.')}/>}
 </div>;
}
