import React,{useEffect,useMemo,useState} from 'react';
import api from '../services/api';
import useStocks from '../hooks/useStocks';
import {productUnits} from '../services/dataMapping';
import FormModal,{useFormClose} from '../components/FormModal';
import useOperation from '../hooks/useOperation';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';

const empty={nome:'',codigoBarras:'',categoria:'',unidade:'UN',custo:'0',precoVenda:'0',observacoes:'',ativo:true,componentes:[],estoqueSaidaId:''};
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
function ProductForm({product,onClose,onSuccess}){
 const stocks=useStocks();
 const [initial]=useState(()=>({...empty,...Object.fromEntries(Object.keys(empty).filter(k=>product?.[k]!==undefined).map(k=>[k,product[k]]))}));
 const [form,setForm]=useState(initial);
 const [stock,setStock]=useState([]),[stockLoading,setStockLoading]=useState(true),[stockError,setStockError]=useState('');
 useEffect(()=>{let active=true;api.get('/insumos').then(({data})=>{if(active)setStock(data.filter(i=>i._id));}).catch(()=>{if(active)setStockError('Não foi possível carregar os itens de estoque. Reabra o formulário para tentar novamente.');}).finally(()=>{if(active)setStockLoading(false);});return()=>{active=false;};},[]);
 const {busy,error,run}=useOperation();
 const dirty=JSON.stringify(form)!==JSON.stringify(initial);
 const close=useFormClose(onClose,dirty,busy);
 const change=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 async function save(e){
  e.preventDefault();
  try{
   await run(()=>product?api.put('/produtos/'+product.codigoProduto,form):api.post('/produtos',form));
   onSuccess(product?'Produto atualizado com sucesso.':'Produto cadastrado com sucesso.');
  }catch{/* Mantém os dados e exibe a mensagem da operação. */}
 }
 return <FormModal labelledBy="product-title" onClose={close} dirty={dirty} busy={busy}>
  <div className="users-editor product-editor">
   <div className="users-editor-heading"><div><p className="home-eyebrow">CADASTROS</p><h2 id="product-title">{product?'Editar produto':'Novo produto'}</h2></div><button type="button" className="users-edit" onClick={close} disabled={busy} aria-label="Fechar formulário">×</button></div>
   <p className="users-editor-intro">Identificação e preços do produto. Código de barras é opcional.</p>
   {error&&<p className="users-message users-error" role="alert">{error}</p>}
   <form onSubmit={save}><fieldset disabled={busy||stockLoading||!!stockError||stocks.loading||!!stocks.error} className="product-fields">
    <label className="product-wide">Nome do produto<input value={form.nome} onChange={e=>change('nome',e.target.value)} required maxLength={200} autoFocus/></label>
    <label className="product-wide">Código de barras (opcional)<input type="text" value={form.codigoBarras} onChange={e=>change('codigoBarras',e.target.value)} maxLength={64} aria-describedby="product-barcode-help" placeholder="Deixe vazio se o produto não tiver código"/></label>
    <small id="product-barcode-help" className="product-wide">Informe o código exatamente como está na embalagem, incluindo zeros à esquerda.</small>
    <label>Categoria<input value={form.categoria} onChange={e=>change('categoria',e.target.value)} maxLength={100}/></label>
    <label>Unidade<select value={form.unidade} onChange={e=>change('unidade',e.target.value)}>{productUnits.map(u=><option key={u} value={u}>{u}</option>)}</select></label>
    <label>Custo (R$)<input type="number" min="0" max="9999999999.99" step="0.01" required value={form.custo} onChange={e=>change('custo',e.target.value)}/></label>
    <label>Preço de venda (R$)<input type="number" min="0" max="9999999999.99" step="0.01" required value={form.precoVenda} onChange={e=>change('precoVenda',e.target.value)}/></label>
    <label className="product-wide">Estoque de saída<select value={stocks.locations.some(l=>l.principal&&l.id===form.estoqueSaidaId)?'':form.estoqueSaidaId} onChange={e=>change('estoqueSaidaId',e.target.value)}><option value="">Principal (padrão)</option>{stocks.locations.filter(l=>!l.principal&&(l.ativo||l.id===form.estoqueSaidaId)).map(l=><option key={l.id} value={l.id} disabled={!l.ativo}>{l.nome}{l.ativo?'':' (inativo)'}</option>)}</select></label><small className="product-wide">PDV e comandas darão baixa nos insumos deste setor.</small>
    <section className="product-wide product-composition" aria-label="Composição de estoque">
     <h3>Consumo de estoque por venda</h3><p>Selecione o insumo e a quantidade consumida por uma unidade deste produto. Exemplo: lata = 1; pack com 12 = 12.</p>
     {stockLoading&&<p role="status">Carregando itens de estoque…</p>}
     {form.componentes.map((c,index)=><div className="product-component" key={index}>
      <label>Insumo {index+1}<select required value={c.stock_item_id} onChange={e=>change('componentes',form.componentes.map((v,i)=>i===index?{...v,stock_item_id:e.target.value}:v))}><option value="">Selecione um item</option>{stock.map(s=><option key={s._id} value={s._id} disabled={!s.ativo&&s._id!==c.stock_item_id}>{s.nome} / {s.unidade}{s.ativo?'':' (inativo)'}</option>)}</select></label>
      <label>Consumo {index+1}<input type="number" required min="0.001" step="0.001" value={c.quantidade} onChange={e=>change('componentes',form.componentes.map((v,i)=>i===index?{...v,quantidade:e.target.value}:v))}/></label>
      <button type="button" className="users-edit" aria-label={'Remover insumo '+(index+1)} onClick={()=>change('componentes',form.componentes.filter((_,i)=>i!==index))}>Remover</button>
     </div>)}
     <button type="button" className="users-secondary" disabled={!stock.length} onClick={()=>change('componentes',[...form.componentes,{stock_item_id:'',quantidade:'1'}])}>+ Adicionar insumo</button>
     {!stockLoading&&!stock.length&&<p>Cadastre os itens em Cadastros → Insumos / itens de estoque.</p>}
     {!form.componentes.length&&<p>Sem vínculo de estoque. Configure os insumos antes de registrar saídas deste produto.</p>}
    </section>
    <label className="product-wide">Observações<textarea value={form.observacoes} onChange={e=>change('observacoes',e.target.value)} maxLength={2000} rows={3}/></label>
    <label className="product-wide">Situação<select value={String(form.ativo)} onChange={e=>change('ativo',e.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
    <div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button type="submit" className="users-primary">{busy?'Salvando…':'Salvar produto'}</button></div>
   </fieldset></form>
   {stocks.error&&<p role="alert" className="users-message users-error">{stocks.error}</p>}
   {stockError&&<p role="alert" className="users-message users-error">{stockError}</p>}
  </div>
 </FormModal>;
}
export default function Produtos(){
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[search,setSearch]=useState(''),[filter,setFilter]=useState('all'),[editing,setEditing]=useState(null);
 async function load(){
  setLoading(true);setError('');
  try{const {data}=await api.get('/produtos');setRows(data);setLoaded(true);}
  catch{setError('Não foi possível carregar os produtos. Tente atualizar a lista.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{let active=true;api.get('/produtos').then(({data})=>{if(active){setRows(data);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar os produtos. Tente atualizar a lista.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const filtered=useMemo(()=>rows.filter(s=>{
  const term=search.trim().toLocaleLowerCase('pt-BR');
  const text=[s.nome,s.codigoBarras,s.categoria,s.codigoProduto].join(' ').toLocaleLowerCase('pt-BR');
  return text.includes(term)&&(filter==='all'||(filter==='active'?s.ativo:!s.ativo));
 }).sort((a,b)=>b.codigoProduto-a.codigoProduto),[rows,search,filter]);
 return <div className="users-page products-page">
  <header className="users-heading"><div><p className="home-eyebrow">CADASTROS</p><h1>Produtos</h1><p>Organize seus produtos e mantenha os preços atualizados.</p></div><button className="users-primary" onClick={()=>{setEditing({});setNotice('');}}>+ Novo produto</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <div className="users-stats">{[['Produtos cadastrados',rows.length],['Produtos ativos',rows.filter(s=>s.ativo).length],['Produtos inativos',rows.filter(s=>!s.ativo).length]].map(([label,count])=><div key={label}><span>{label}</span><strong>{loaded?count:'—'}</strong></div>)}</div>
  <section className="users-list" aria-label="Lista de produtos" aria-busy={loading}>
   <div className="product-list-heading"><div><h2>Seus produtos</h2><p>Cadastros mais recentes aparecem primeiro.</p></div><button className="users-secondary" disabled={loading} onClick={load}>Atualizar</button></div>
   <div className="users-toolbar"><div className="users-search"><input aria-label="Buscar produtos" placeholder="Nome, categoria ou código de barras" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filtrar produtos" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os produtos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>{(search||filter!=='all')&&<button className="users-edit" onClick={()=>{setSearch('');setFilter('all');}}>Limpar filtros</button>}</div>
   <div className="users-table-wrap"><table><thead><tr><th>Produto</th><th>Código de barras</th><th>Preços</th><th>Situação</th><th><span className="users-sr-only">Ações</span></th></tr></thead><tbody>
    {loading?<tr><td colSpan={5} className="users-empty">Carregando produtos…</td></tr>:!loaded?<tr><td colSpan={5} className="users-empty">Lista indisponível. Clique em Atualizar para tentar novamente.</td></tr>:!filtered.length?<tr><td colSpan={5} className="users-empty">{rows.length?'Nenhum produto corresponde aos filtros.':'Nenhum produto cadastrado. Adicione seu primeiro produto.'}</td></tr>:filtered.map(s=><tr key={s.codigoProduto}><td><div className="users-person"><span className="users-avatar" aria-hidden="true">{s.nome[0]?.toUpperCase()}</span><div><strong>{s.nome}</strong><span>#{String(s.codigoProduto).padStart(4,'0')}{s.categoria?' · '+s.categoria+' / '+s.unidade:' · '+s.unidade}</span></div></div></td><td>{s.codigoBarras||'Sem código de barras'}</td><td><div className="product-contact"><strong>{money.format(s.precoVenda)}</strong><span>Custo: {money.format(s.custo)}</span></div></td><td><span className={'users-status '+(s.ativo?'is-active':'is-inactive')}><i aria-hidden="true"/>{s.ativo?'Ativo':'Inativo'}</span></td><td><button className="users-edit" aria-label={'Editar produto '+s.nome} onClick={()=>{setEditing(s);setNotice('');}}>Editar ↗</button></td></tr>)}
   </tbody></table></div><footer className="users-list-footer"><span>{loaded&&!loading?filtered.length+' de '+rows.length+' produtos':'Consulta de produtos'}</span><span>Produtos e preços</span></footer>
  </section>
  <p className="product-note">Produtos podem compartilhar o mesmo insumo. Configure o consumo por venda na edição; o saldo é mantido nos itens de estoque.</p>
  {editing&&<ProductForm product={editing.codigoProduto?editing:null} onClose={()=>setEditing(null)} onSuccess={message=>{setEditing(null);setNotice(message);load();}}/>}
 </div>;
}
