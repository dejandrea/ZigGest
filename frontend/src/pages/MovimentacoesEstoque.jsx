import React,{useEffect,useState} from 'react';
import api from '../services/api';
import {StockMovementForm} from '../components/InventoryForms';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
export default function MovimentacoesEstoque(){
 const [data,setData]=useState({rows:[],items:[],products:[]}),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[creating,setCreating]=useState(false);
 async function fetchData(){const [rows,items,products]=await Promise.all([api.get('/movimentacoes-estoque'),api.get('/insumos'),api.get('/produtos')]);return {rows:rows.data,items:items.data,products:products.data};}
 async function load(){setLoading(true);setError('');try{setData(await fetchData());setLoaded(true);}catch{setError('Não foi possível carregar as movimentações. Tente atualizar.');}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(value=>{if(active){setData(value);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar as movimentações. Tente atualizar.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const rows=[...data.rows].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">ESTOQUE</p><h1>Entradas e saídas</h1><p>Histórico de movimentações na unidade base de cada insumo.</p></div><button className="users-primary" disabled={loading||!loaded} onClick={()=>{setCreating(true);setNotice('');}}>+ Nova movimentação</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <section className="users-list" aria-label="Histórico de estoque"><div className="product-list-heading"><div><h2>Movimentações recentes</h2><p>Registros preservados para consulta.</p></div><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div><div className="users-table-wrap"><table><thead><tr><th>Data</th><th>Tipo / referência</th><th>Movimentação dos insumos</th><th>Observações</th></tr></thead><tbody>{loading?<tr><td colSpan={4} className="users-empty">Carregando movimentações…</td></tr>:!loaded?<tr><td colSpan={4} className="users-empty">Histórico indisponível.</td></tr>:!rows.length?<tr><td colSpan={4} className="users-empty">Nenhuma movimentação registrada.</td></tr>:rows.map(r=><tr key={r.id}><td>{new Date(r.created_at).toLocaleString('pt-BR')}</td><td><strong>{r.tipo==='ENTRADA'?'Entrada':'Saída'}</strong><div className="inventory-code">{r.descricao}</div><div className="inventory-code">{number.format(Number(r.quantidade))}{r.tipo==='ENTRADA'?' × '+number.format(Number(r.fator)):''}</div></td><td>{r.linhas.map(l=><div key={l.id} className="inventory-line"><strong>{l.nome}: {Number(l.quantidade)>0?'+':''}{number.format(Number(l.quantidade))} {l.unidade}</strong><span>Saldo após: {number.format(Number(l.saldo_apos))} {l.unidade}</span></div>)}</td><td className="inventory-notes">{r.observacoes||'—'}</td></tr>)}</tbody></table></div></section>
  <p className="product-note">A saída por produto movimenta somente o estoque. A integração automática com vendas e PDV será feita na etapa correspondente.</p>
  {creating&&<StockMovementForm items={data.items} products={data.products} onClose={()=>setCreating(false)} onSuccess={message=>{setCreating(false);setNotice(message);load();}}/>}
 </div>;
}
