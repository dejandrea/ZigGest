import {sumMoney} from '../services/decimalMoney';
import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../services/api';
import {useAuth} from '../auth/AuthContext';
import {RecipeForm,ProductionForm,ReverseProduction} from '../components/ProductionForms';
import {productionQuantity as q} from '../services/production';
import {money} from '../services/finance';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/Production.css';

export function ProductionHistory({rows,locations,onReverse}){
 return <section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Lote / data</th><th>Ficha / setor de consumo</th><th>Produtos e rendimento</th><th>Custo estimado</th><th>Situação / detalhes</th></tr></thead><tbody>{!rows.length?<tr><td colSpan={5} className="users-empty">Nenhuma produção encontrada.</td></tr>:rows.map(batch=><tr key={batch.id}>
  <td><strong>#{batch.numero}</strong><div>{new Date(batch.ocorrido_em).toLocaleString('pt-BR')}</div><small>Registro: {new Date(batch.created_at).toLocaleString('pt-BR')}</small></td>
  <td><strong>{batch.recipe_nome}</strong><div>{q(batch.multiplier)} lote(s) · versão {batch.recipe_revision+1}</div><small>{locations.find(row=>row.id===batch.location_id)?.nome??'Principal'}</small>{batch.actor_nome&&<div>Responsável: {batch.actor_nome}</div>}</td>
  <td>{batch.outputs.map(line=><div className="production-result" key={line.product_id}><strong>{line.nome}: {q(line.quantidade)} {line.unidade}</strong><small>Previsto: {q(line.previsto)} · Diferença: {q(Number(line.quantidade)-Number(line.previsto))} {line.unidade}</small></div>)}</td>
  <td>{money(batch.total_cost)}<div><small>Adicionais: {money(batch.extra_cost)}</small></div></td>
  <td>{batch.status==='REVERSED'?'Estornada':'Confirmada'}<details><summary>Ingredientes e observações</summary>{batch.inputs.map(line=><p key={line.item_id}>{line.nome}: {q(line.quantidade)} {line.unidade} · {money(line.custo_total)}</p>)}<p>{batch.observacoes||'Sem observações.'}</p>{batch.reverse_reason&&<p>Estorno: {batch.reverse_reason} · {new Date(batch.reversed_at).toLocaleString('pt-BR')}</p>}</details>{onReverse&&batch.status==='CONFIRMED'&&<button className="users-edit" onClick={()=>onReverse(batch)}>Estornar produção #{batch.numero}</button>}</td>
 </tr>)}</tbody></table></div></section>;
}
export default function Producao({report=false}){
 const {isAdmin}=useAuth(),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0),[notice,setNotice]=useState('');
 const [editor,setEditor]=useState(null),[producing,setProducing]=useState(null),[reverse,setReverse]=useState(null);
 const [start,setStart]=useState(''),[end,setEnd]=useState(''),[recipeFilter,setRecipeFilter]=useState(''),[status,setStatus]=useState('CONFIRMED');
 useEffect(()=>{let live=true;setLoading(true);setError('');
  Promise.all([api.get('/producao'),api.get('/itens'),api.get('/estoques')]).then(([production,items,stocks])=>{if(live)setData({...production.data,items:items.data,locations:stocks.data.locations});}).catch(()=>{if(live){setData(null);setError('Não foi possível carregar as produções. Tente atualizar.');}}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[version]);
 function saved(result){setEditor(null);setProducing(null);setReverse(null);setNotice(result.status==='REVERSED'?'Produção estornada.':result.status==='CONFIRMED'?'Produção registrada e estoque atualizado.':'Ficha técnica salva.');setVersion(value=>value+1);}
 const recipes=data?.recipes??[],items=data?.items??[],rows=[...(data?.batches??[])].filter(row=>{
  const date=new Date(row.ocorrido_em),local=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  return (!start||local>=start)&&(!end||local<=end)&&(!recipeFilter||row.recipe_id===recipeFilter)&&(status==='ALL'||row.status===status);
 }).sort((a,b)=>b.numero-a.numero),confirmed=rows.filter(row=>row.status==='CONFIRMED');
 const summary=new Map();for(const batch of confirmed)for(const line of batch.outputs){const key=line.product_id+':'+line.unidade,previous=summary.get(key)??{...line,quantidade:0,previsto:0};summary.set(key,{...previous,quantidade:previous.quantidade+Number(line.quantidade),previsto:previous.previsto+Number(line.previsto)});}
 const available=recipe=>recipe.ativo&&recipe.outputs.every(line=>items.some(item=>item.productId===line.product_id&&item.ativo&&item.abastecimento==='PRODUCTION'))&&recipe.inputs.every(line=>items.some(item=>item.stockId===line.item_id&&item.ativo));
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">{report?'RELATÓRIOS':'ESTOQUE'}</p><h1>{report?'Relatório de produções':'Produção'}</h1><p>Produção em lote: ingredientes são consumidos na produção; vendas baixam os produtos acabados.</p></div><div className="invoice-entry-actions">{!report&&<><Link className="users-secondary" to="/relatorios/producao">Relatório de produções</Link><button className="users-primary" disabled={loading||!data} onClick={()=>setEditor({})}>Nova ficha técnica</button></>}<button className="users-secondary" disabled={loading} onClick={()=>setVersion(value=>value+1)}>Atualizar</button></div></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  {loading?<p role="status">Carregando produções…</p>:data&&<>
   {!report&&<section className="users-list production-recipes"><h2>Fichas técnicas de produção</h2><p>Cadastre os produtos como “Abastecido por produção” em <Link to="/itens">Itens</Link> e selecione os ingredientes e rendimentos aqui.</p>{!recipes.length?<p>Nenhuma ficha técnica cadastrada.</p>:recipes.map(recipe=><article key={recipe.id}><div><strong>#{recipe.numero} · {recipe.nome}</strong><p>{recipe.inputs.length} ingredientes · {recipe.outputs.map(line=>(items.find(item=>item.productId===line.product_id)?.nome??'Produto indisponível')+': '+q(line.quantidade)).join(' / ')}</p><small>{recipe.ativo?'Ativa':'Inativa'} · versão {recipe.revision+1}</small></div><div className="invoice-entry-actions"><button className="users-edit" onClick={()=>setEditor(recipe)}>Editar ficha {recipe.nome}</button><button className="users-primary" disabled={!available(recipe)} onClick={()=>setProducing(recipe)}>Produzir {recipe.nome}</button></div></article>)}</section>}
   <h2>{report?'Produções no período':'Histórico de produções'}</h2>
   <div className="users-toolbar"><label>Produção de<input type="date" value={start} onChange={event=>setStart(event.target.value)}/></label><label>Produção até<input type="date" min={start} value={end} onChange={event=>setEnd(event.target.value)}/></label><label>Ficha técnica<select value={recipeFilter} onChange={event=>setRecipeFilter(event.target.value)}><option value="">Todas as fichas</option>{recipes.map(recipe=><option key={recipe.id} value={recipe.id}>{recipe.nome}</option>)}</select></label><label>Situação da produção<select value={status} onChange={event=>setStatus(event.target.value)}><option value="CONFIRMED">Confirmadas</option><option value="REVERSED">Estornadas</option><option value="ALL">Todas</option></select></label></div>
   <div className="users-stats"><div><span>Produções confirmadas</span><strong>{confirmed.length}</strong></div><div><span>Custo estimado das confirmadas</span><strong>{money(sumMoney(confirmed.map(row=>row.total_cost)))}</strong></div><div><span>Produções estornadas na seleção</span><strong>{rows.filter(row=>row.status==='REVERSED').length}</strong></div></div>
   {report&&<section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Produto acabado</th><th>Unidade</th><th>Rendimento previsto</th><th>Produzido</th><th>Diferença</th></tr></thead><tbody>{[...summary.values()].map(line=><tr key={line.product_id+line.unidade}><td>{line.nome}</td><td>{line.unidade}</td><td>{q(line.previsto)}</td><td>{q(line.quantidade)}</td><td>{q(line.quantidade-line.previsto)}</td></tr>)}{!summary.size&&<tr><td colSpan={5}>Nenhuma produção confirmada na seleção.</td></tr>}</tbody></table></div></section>}
   <ProductionHistory rows={rows} locations={data.locations} onReverse={!report&&isAdmin?setReverse:null}/>
   <p className="product-note">Custos são estimativas com base nos valores informados na ficha e nos adicionais do lote. Zero não significa custo real zero. Rendimentos são comparados por produto; tamanhos diferentes não são somados. Editar a ficha não altera produções anteriores.</p>
  </>}
  {editor&&data&&<RecipeForm recipe={editor.id?editor:null} items={items} onClose={()=>setEditor(null)} onSuccess={saved}/>}
  {producing&&data&&<ProductionForm recipe={producing} items={items} locations={data.locations} onClose={()=>setProducing(null)} onSuccess={saved}/>}
  {reverse&&<ReverseProduction batch={reverse} onClose={()=>setReverse(null)} onSuccess={saved}/>}
 </div>;
}
