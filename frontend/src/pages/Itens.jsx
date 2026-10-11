import React,{useEffect,useState} from 'react';
import api from '../services/api';
import ItemForm from '../components/ItemForm';
import {money} from '../services/finance';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
export default function Itens(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[type,setType]=useState('ALL'),[status,setStatus]=useState('ALL'),[editing,setEditing]=useState(null);
 async function load(){setLoading(true);setError('');try{const {data}=await api.get('/itens');setRows(data);}catch{setError('Não foi possível carregar os itens. Tente atualizar.');}finally{setLoading(false);}}
 useEffect(()=>{let live=true;api.get('/itens').then(({data})=>{if(live)setRows(data);}).catch(()=>{if(live)setError('Não foi possível carregar os itens. Tente atualizar.');}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[]);
 const filtered=rows.filter(row=>[row.nome,row.codigoBarras,row.categoria,row.codigoProduto,row.codigoInsumo].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))&&
  (type==='ALL'||type==='BOTH'&&row.produto&&row.insumo||type==='PRODUCT'&&row.produto&&!row.insumo||type==='STOCK'&&row.insumo&&!row.produto)&&
  (status==='ALL'||status==='ACTIVE'&&row.ativo||status==='INACTIVE'&&!row.ativo));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">CADASTROS</p><h1>Itens</h1><p>Produtos para venda, insumos de estoque e itens que cumprem as duas funções.</p></div><button className="users-primary" onClick={()=>{setEditing({});setNotice('');}}>Novo item</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <div className="users-stats">{[['Itens',rows.length],['Disponíveis para venda',rows.filter(row=>row.produto&&row.ativo).length],['Com estoque',rows.filter(row=>row.insumo&&row.ativo).length]].map(([label,count])=><div key={label}><span>{label}</span><strong>{loading?'—':count}</strong></div>)}</div>
  <section className="users-list" aria-label="Lista de itens"><div className="users-toolbar"><div className="users-search"><input aria-label="Buscar itens" placeholder="Nome, código ou código de barras" value={search} onChange={event=>setSearch(event.target.value)}/></div><select aria-label="Filtrar uso do item" value={type} onChange={event=>setType(event.target.value)}><option value="ALL">Todos os usos</option><option value="PRODUCT">Apenas produto</option><option value="STOCK">Apenas insumo</option><option value="BOTH">Produto e insumo</option></select><select aria-label="Filtrar situação" value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">Todas as situações</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div>
   <div className="users-table-wrap"><table><thead><tr><th>Item</th><th>Uso</th><th>Preço de venda</th><th>Estoque consolidado</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="users-empty">Carregando itens…</td></tr>:error?<tr><td colSpan={6} className="users-empty">Lista indisponível. Tente atualizar.</td></tr>:!filtered.length?<tr><td colSpan={6} className="users-empty">Nenhum item encontrado.</td></tr>:filtered.map(row=><tr key={row.key}><td><strong>{row.nome}</strong><div className="inventory-code">{row.unidade}{row.codigoBarras?' · '+row.codigoBarras:''}</div></td><td>{row.produto&&row.insumo?'Produto e insumo':row.produto?'Produto':'Insumo'}</td><td>{row.produto?money(row.precoVenda):'—'}</td><td>{row.insumo?Number(row.saldo).toLocaleString('pt-BR',{maximumFractionDigits:3})+' '+row.unidade:'—'}</td><td>{row.ativo?'Ativo':'Inativo'}</td><td><button className="users-edit" aria-label={'Editar item '+row.nome} onClick={()=>{setEditing(row);setNotice('');}}>Editar</button></td></tr>)}
   </tbody></table></div>
  </section><p className="product-note">Itens com ambas as funções usam o próprio estoque. Produtos de atacado e receitas usam itens com estoque na sua composição.</p>
  {editing&&<ItemForm item={editing.key?editing:null} onClose={()=>setEditing(null)} onSuccess={(message,_item,keepOpen)=>{if(!keepOpen)setEditing(null);setNotice(message);load();}}/>}
 </div>;
}
