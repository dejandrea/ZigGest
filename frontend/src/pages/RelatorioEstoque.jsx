import React,{useState} from 'react';
import useReportData from '../hooks/useReportData';
import useStocks,{sectorRows,StockSelector} from '../hooks/useStocks';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
const quantity=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
export default function RelatorioEstoque(){
 const report=useReportData('/insumos'),stocks=useStocks(),[location,setLocation]=useState('');
 const {data}=report,loading=report.loading||stocks.loading,error=report.error||stocks.error,refresh=()=>{report.refresh();stocks.refresh();};
 const [search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const low=item=>item.ativo&&item.estoqueMinimo!=null&&Number(item.saldo)<=Number(item.estoqueMinimo);
 const rows=sectorRows(data??[],stocks.balances,location).filter(item=>[item.nome,item.codigoInsumo].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))&&(filter==='all'||filter==='negative'&&Number(item.saldo)<0||filter==='low'&&low(item)||filter==='active'&&item.ativo||filter==='inactive'&&!item.ativo));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>Relatório de estoque</h1><p>Posição atual dos insumos na unidade de cada item.</p></div><button className="users-secondary" disabled={loading} onClick={refresh}>Atualizar</button></header>
 {error&&<p role="alert" className="users-message users-error">{error}</p>}
 <div className="users-toolbar"><StockSelector locations={stocks.locations} value={location} onChange={setLocation}/><input aria-label="Buscar no relatório de estoque" placeholder="Nome ou código do insumo" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar relatório de estoque" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os itens</option><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="negative">Saldo negativo</option><option value="low">No mínimo ou abaixo</option></select></div>
 <div className="users-stats">{[['Itens na seleção',rows.length],['Com saldo negativo',rows.filter(i=>Number(i.saldo)<0).length],['No mínimo ou abaixo',rows.filter(low).length]].map(([label,value])=><div key={label}><span>{label}</span><strong>{data&&!loading?value:'—'}</strong></div>)}</div>
 <section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Insumo</th><th>Unidade</th><th>Saldo atual</th><th>Estoque mínimo</th><th>Situação</th></tr></thead><tbody>{loading?<tr><td colSpan={5} role="status">Carregando relatório…</td></tr>:!data||!!stocks.error?<tr><td colSpan={5}>Relatório indisponível. Clique em Atualizar.</td></tr>:rows.length?rows.map(item=><tr key={item._id}><td>{item.nome}<div>#{item.codigoInsumo}</div></td><td>{item.unidade}</td><td className={Number(item.saldo)<0||low(item)?'inventory-low':''}>{quantity.format(item.saldo)}</td><td>{item.estoqueMinimo==null?'Não definido':quantity.format(item.estoqueMinimo)}</td><td>{item.ativo?'Ativo':'Inativo'}</td></tr>):<tr><td colSpan={5}>Nenhum insumo encontrado.</td></tr>}</tbody></table></div></section><p className="product-note">As quantidades permanecem separadas por insumo e unidade. Estoque mínimo não definido não gera alerta de mínimo.</p></div>;
}
