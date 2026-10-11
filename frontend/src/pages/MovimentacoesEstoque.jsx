import React,{useEffect,useState} from 'react';
import api from '../services/api';
import useStocks from '../hooks/useStocks';
import {StockTransfer} from '../components/StockLocations';
import {useNavigate} from 'react-router-dom';
import EntryFinancePrompt from '../components/EntryFinancePrompt';
import InvoiceEntryForm from '../components/InvoiceEntryForm';
import InvoiceDetails from '../components/InvoiceDetails';
import {StockMovementForm} from '../components/InventoryForms';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
export default function MovimentacoesEstoque(){
 const stocks=useStocks(),[transfer,setTransfer]=useState(false);
 const navigate=useNavigate(),[financeEntry,setFinanceEntry]=useState(null);
 function saved(message,entry){setCreating(false);setInvoiceEntry(false);setNotice(message);setTransfer(false);stocks.refresh();if(entry?.sourceId)setFinanceEntry(entry.sourceId);load();}
 const [data,setData]=useState({rows:[],items:[],products:[]}),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[creating,setCreating]=useState(false),[invoiceEntry,setInvoiceEntry]=useState(false),[invoiceId,setInvoiceId]=useState(null);
 async function fetchData(){const [rows,items,products]=await Promise.all([api.get('/movimentacoes-estoque'),api.get('/insumos'),api.get('/produtos')]);return {rows:rows.data,items:items.data,products:products.data};}
 async function load(){setLoading(true);setError('');try{setData(await fetchData());setLoaded(true);}catch{setError('Não foi possível carregar as movimentações. Tente atualizar.');}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(value=>{if(active){setData(value);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar as movimentações. Tente atualizar.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const rows=[...data.rows].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">ESTOQUE</p><h1>Entradas e saídas</h1><p>Histórico de movimentações na unidade base de cada insumo.</p></div><div className="invoice-entry-actions"><button className="users-secondary" disabled={loading||stocks.loading||!!stocks.error||!loaded} onClick={()=>setTransfer(true)}>Transferir estoque</button><button className="users-secondary" disabled={loading||!loaded} onClick={()=>{setInvoiceEntry(true);setNotice('');}}>Entrada por NF-e</button><button className="users-primary" disabled={loading||!loaded} onClick={()=>{setCreating(true);setNotice('');}}>+ Nova movimentação</button></div></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <section className="users-list" aria-label="Histórico de estoque"><div className="product-list-heading"><div><h2>Movimentações recentes</h2><p>Datas de chegada e de registro preservadas. Lista e saldos seguem a ordem de registro.</p></div><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div><div className="users-table-wrap"><table><thead><tr><th>Data</th><th>Tipo / referência</th><th>Movimentação dos insumos</th><th>Observações</th></tr></thead><tbody>{loading?<tr><td colSpan={4} className="users-empty">Carregando movimentações…</td></tr>:!loaded?<tr><td colSpan={4} className="users-empty">Histórico indisponível.</td></tr>:!rows.length?<tr><td colSpan={4} className="users-empty">Nenhuma movimentação registrada.</td></tr>:rows.map(r=><tr key={r.id}><td>{new Date(r.ocorrido_em??r.created_at).toLocaleString('pt-BR')}<div className="inventory-code">Registrado em: {new Date(r.created_at).toLocaleString('pt-BR')}</div></td><td><strong>{r.tipo==='ENTRADA'?'Entrada':r.tipo==='AJUSTE'?'Ajuste':r.tipo==='TRANSFERENCIA'?'Transferência':r.tipo==='PRODUCAO'?'Produção':r.tipo==='ESTORNO_PRODUCAO'?'Estorno de produção':'Saída'}</strong><div className="inventory-code">{r.descricao}</div><div className="inventory-code">{!r.invoice_id&&r.tipo!=='AJUSTE'&&<>{number.format(Number(r.quantidade))}{r.tipo==='ENTRADA'?' × '+number.format(Number(r.fator)):''}</>}{r.invoice_id&&<button className="users-edit invoice-download" onClick={()=>setInvoiceId(r.invoice_id)}>Consultar NF-e</button>}</div></td><td>{r.linhas.map(l=><div key={l.id} className="inventory-line"><strong>{l.nome}: {Number(l.quantidade)>0?'+':''}{number.format(Number(l.quantidade))} {l.unidade}</strong><span>{stocks.locations.find(s=>s.id===l.location_id)?.nome??'Principal'} · Saldo no setor após registro: {number.format(Number(l.saldo_local_apos??l.saldo_apos))} {l.unidade}</span></div>)}</td><td className="inventory-notes">{r.observacoes||'—'}{r.tipo==='ENTRADA'&&<div><button className="users-edit" onClick={()=>navigate('/contas-pagar?entrada='+encodeURIComponent(r.id))}>Lançar financeiro</button></div>}</td></tr>)}</tbody></table></div></section>
  <p className="product-note">Entradas chegam ao principal. Saídas usam o setor do produto. Transferências preservam o saldo total e registram os dois setores.</p>
  {stocks.error&&<p role="alert" className="users-message users-error">{stocks.error} <button onClick={stocks.refresh}>Tentar novamente</button></p>}
  {transfer&&<StockTransfer locations={stocks.locations} balances={stocks.balances} items={data.items} onClose={()=>setTransfer(false)} onSuccess={saved}/>}
  {financeEntry&&<EntryFinancePrompt sourceId={financeEntry} onClose={()=>setFinanceEntry(null)}/>}
  {invoiceEntry&&<InvoiceEntryForm items={data.items} onClose={()=>setInvoiceEntry(false)} onSuccess={saved}/>}
  {invoiceId&&<InvoiceDetails items={data.items} onSuccess={message=>{setNotice(message);stocks.refresh();load();}} id={invoiceId} onClose={()=>setInvoiceId(null)}/>}
  {creating&&<StockMovementForm items={data.items} products={data.products} onClose={()=>setCreating(false)} onSuccess={saved}/>}
 </div>;
}
