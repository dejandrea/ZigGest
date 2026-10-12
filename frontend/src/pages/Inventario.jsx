import React,{useEffect,useState} from 'react';
import api from '../services/api';
import useStocks from '../hooks/useStocks';
import {useAuth} from '../auth/AuthContext';
import useOperation from '../hooks/useOperation';
import FormModal,{useFormClose} from '../components/FormModal';
import ItemForm from '../components/ItemForm';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/Inventario.css';

const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const statusLabels={DRAFT:'Em contagem',CONFIRMED:'Confirmado',CANCELLED:'Cancelado'};
export function inventoryCounts(lines,values){
 return lines.map(line=>{
  const raw=values[line.id??line.stock_item_id]??'';
  if(raw!==''&&(!/^\d+(\.\d{1,3})?$/.test(String(raw))||Number(raw)>999999999999.999))throw new Error('Informe quantidades zero ou positivas, com até três casas decimais.');
  return {...(line.id?{line_id:line.id}:{item_id:line.stock_item_id}),contado:raw===''?null:Number(raw)};
 });
}
function OpenInventory({items,locations,onClose,onOpened}){
 const [id]=useState(()=>crypto.randomUUID()),[kind,setKind]=useState('COUNT'),[itemId,setItemId]=useState(''),[locationId,setLocationId]=useState(''),[description,setDescription]=useState(''),[notes,setNotes]=useState('');
 const {busy,error,run}=useOperation();
 const dirty=!!description||!!notes||!!itemId||!!locationId||kind!=='COUNT',close=useFormClose(onClose,dirty,busy);
 async function submit(event){event.preventDefault();try{const {data}=await run(()=>api.post('/inventarios',{id,action:'OPEN',data:{kind,location_id:locationId||null,item_id:itemId||null,descricao:description,observacoes:notes}}));onOpened(data.id);}catch{/* Keep form for retry. */}}
 return <FormModal labelledBy="inventory-title" busy={busy} dirty={dirty} onClose={close}><div className="users-editor product-editor"><div className="users-editor-heading"><h2 id="inventory-title">Novo inventário</h2><button type="button" aria-label="Fechar formulário" disabled={busy} onClick={close}>×</button></div>{error&&<p role="alert" className="users-message users-error">{error}</p>}<form onSubmit={submit}><fieldset className="product-fields" disabled={busy}>
 <label>Tipo<select value={kind} onChange={e=>setKind(e.target.value)}><option value="COUNT">Contagem de estoque</option><option value="INITIAL">Inventário inicial</option></select></label>
 <label>Estoque / setor<select value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Geral — todos os setores ativos</option>{locations.filter(l=>l.ativo).map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
 <label>Abrangência<select value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">Geral — todos os insumos ativos</option>{items.filter(item=>item.ativo).map(item=><option key={item._id} value={item._id}>{item.nome} / {item.unidade}</option>)}</select></label>
 <small className="product-wide">{kind==='INITIAL'?'O inventário inicial inclui posições sem movimentações e com saldo zero no setor escolhido. Informe as quantidades de partida.':'Escolha um insumo para contagem individual ou faça uma contagem geral. Cada setor terá sua própria quantidade física.'}</small>
 <label className="product-wide">Descrição<input required maxLength={200} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="product-wide">Observações<textarea maxLength={2000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}/></label><div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Cancelar</button><button className="users-primary">{busy?'Abrindo…':'Abrir contagem'}</button></div></fieldset></form></div></FormModal>;
}
export default function Inventario(){
 const {isAdmin}=useAuth(),stocks=useStocks();
 const [inventories,setInventories]=useState([]),[items,setItems]=useState([]),[selected,setSelected]=useState(null),[counts,setCounts]=useState({}),[creating,setCreating]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[review,setReview]=useState(null),[search,setSearch]=useState('');
 const {busy,error,run}=useOperation();
 function choose(inventory){setSelected(inventory);setCounts(Object.fromEntries(inventory.lines.map(line=>[line.id??line.stock_item_id,line.contado==null?'':String(line.contado)])));setReview(null);setSearch('');}
 const [newItem,setNewItem]=useState(false),[pendingItems,setPendingItems]=useState([]);
 async function includeItems(registered){
  if(!registered.length)return;
  try{await run(async()=>{
   let current=selected;
   for(const item of registered){
    const {data}=await api.post('/inventarios',{id:current.id,action:'ADD_ITEM',revision:current.revision,data:{item_id:item.stockId}});
    current=data;
    setSelected(data);setInventories(previous=>previous.map(row=>row.id===data.id?data:row));
    setCounts(previous=>({...Object.fromEntries(data.lines.map(line=>[line.id,line.contado==null?'':String(line.contado)])),...previous}));
    setPendingItems(previous=>previous.filter(row=>row.stockId!==item.stockId));
   }
  });setReview(null);setSearch('');setNotice('Novos itens incluídos na contagem. As quantidades já digitadas foram preservadas.');}catch{/* Keep registered items available for retry without registering duplicates. */}
 }
 function itemSaved(_message,item,keepOpen){
  if(item.insumo&&item.ativo&&item.stockId){
   setItems(previous=>[...previous.filter(row=>row._id!==item.stockId),item._stock??{_id:item.stockId,nome:item.nome,unidade:item.unidade,ativo:item.ativo}]);
   const pending=[...pendingItems.filter(row=>row.stockId!==item.stockId),item];
   setPendingItems(pending);if(!keepOpen){setNewItem(false);includeItems(pending);}
  }else if(!keepOpen){setNewItem(false);includeItems(pendingItems);setNotice('Item cadastrado. Apenas itens ativos marcados como Insumo podem participar da contagem.');}
 }
 function closeItem(){setNewItem(false);includeItems(pendingItems);}
 async function fetchData(){const [rows,stock]=await Promise.all([api.get('/inventarios'),api.get('/insumos')]);return {rows:rows.data,stock:stock.data};}
 async function load(id){setLoading(true);setLoadError('');try{const data=await fetchData();setInventories(data.rows);setItems(data.stock);if(id){const inventory=data.rows.find(row=>row.id===id);if(inventory)choose(inventory);}}catch{setLoadError('Não foi possível carregar o inventário. Tente atualizar.');}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(data=>{if(active){setInventories(data.rows);setItems(data.stock);}}).catch(()=>{if(active)setLoadError('Não foi possível carregar o inventário. Tente atualizar.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const initialCounts=selected?Object.fromEntries(selected.lines.map(line=>[line.id??line.stock_item_id,line.contado==null?'':String(line.contado)])):{};
 const dirty=selected?.lines.some(line=>(counts[line.id??line.stock_item_id]??'')!==initialCounts[line.id??line.stock_item_id]);
 useEffect(()=>{if(!dirty&&!busy)return;const protect=event=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[dirty,busy]);
 const lines=(selected?.lines??[]).filter(line=>[line.nome,line.unidade,line.location_nome].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
 const counted=(selected?.lines??[]).filter(line=>(counts[line.id??line.stock_item_id]??'')!=='');
 async function action(name){
  try{await run(async()=>{const data=name==='SAVE'?{lines:inventoryCounts(selected.lines,counts)}:{};await api.post('/inventarios',{id:selected.id,action:name,revision:selected.revision,data});});setReview(null);setNotice(name==='CONFIRM'?'Inventário confirmado. Ajustes registrados no histórico.':name==='REBASE'?'Referências atualizadas. Reconte os itens alterados.':name==='CANCEL'?'Inventário cancelado.':'Contagem salva.');await load(selected.id);}catch{/* Preserve counts on failure. */}
 }
 function back(){if((dirty||pendingItems.length)&&!window.confirm('Voltar à lista sem salvar as quantidades ou incluir os itens pendentes? Os itens cadastrados permanecerão no cadastro.'))return;setSelected(null);setReview(null);setPendingItems([]);}
 return <div className="users-page products-page"><header className="users-heading"><div><p className="home-eyebrow">ESTOQUE</p><h1>Inventário</h1><p>Contagem geral, individual e inicial, com revisão e histórico dos ajustes.</p></div>{!selected&&<button className="users-primary" disabled={loading||!!loadError||stocks.loading||!!stocks.error} onClick={()=>setCreating(true)}>+ Novo inventário</button>}</header>
 {stocks.error&&<p role="alert" className="users-message users-error">{stocks.error} <button onClick={stocks.refresh}>Tentar novamente</button></p>}
 {(loadError||error)&&<p role="alert" className="users-message users-error">{loadError||error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
 {!selected?<section className="users-list"><div className="product-list-heading"><h2>Contagens registradas</h2><button className="users-secondary" disabled={loading} onClick={()=>load()}>Atualizar</button></div><div className="users-table-wrap"><table><thead><tr><th>Descrição</th><th>Tipo / abrangência</th><th>Abertura</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{loading?<tr><td colSpan={5}>Carregando…</td></tr>:inventories.length?[...inventories].sort((a,b)=>b.created_at.localeCompare(a.created_at)).map(inv=><tr key={inv.id}><td>{inv.descricao}</td><td>{inv.kind==='INITIAL'?'Inicial':'Contagem'} · {inv.item_id?'Individual':'Geral'} · {inv.location_id?(stocks.locations.find(l=>l.id===inv.location_id)?.nome??inv.lines[0]?.location_nome):'Todos os setores'}</td><td>{new Date(inv.created_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}</td><td>{statusLabels[inv.status]}</td><td><button className="users-edit" onClick={()=>choose(inv)}>Abrir {inv.descricao}</button></td></tr>):<tr><td colSpan={5} className="users-empty">{loadError?'Lista indisponível. Clique em Atualizar.':'Nenhum inventário registrado.'}</td></tr>}</tbody></table></div></section>:<>
 <div className="inventory-count-heading"><div><h2>{selected.descricao}</h2><p>{selected.kind==='INITIAL'?'Inventário inicial':'Contagem de estoque'} · {statusLabels[selected.status]} · {counted.length} de {selected.lines.length} posições contadas</p></div><button className="users-secondary" disabled={busy||loading} onClick={back}>Voltar à lista</button><button className="users-secondary" disabled={busy||loading||dirty} onClick={()=>load(selected.id)}>Atualizar contagem</button></div>
 <p className="product-note">Deixe em branco os itens não contados. Zero significa que não há unidades físicas. Os saldos só mudam após a confirmação de um administrador. Evite movimentar os itens durante a contagem.</p>
 <div className="users-toolbar">{selected.status==='DRAFT'&&<button type="button" className="users-secondary" disabled={busy||loading||newItem} onClick={()=>{setReview(null);setNewItem(true);}}>Cadastrar novo item</button>}<input aria-label="Buscar insumo na contagem" placeholder="Nome do insumo" value={search} onChange={e=>setSearch(e.target.value)}/></div>
 <section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Insumo</th><th>Saldo de referência</th><th>Quantidade física</th><th>Diferença</th></tr></thead><tbody>{lines.map(line=><tr key={line.id}><td>{line.nome}<div>{line.unidade}{line.location_nome?' · '+line.location_nome:''}</div></td><td>{number.format(line.saldo_referencia)} {line.unidade}</td><td><input className="inventory-count-input" aria-label={'Quantidade física de '+line.nome+(line.location_nome?' / '+line.location_nome:'')} type="number" min="0" max="999999999999.999" step="0.001" disabled={selected.status!=='DRAFT'||busy||loading} value={counts[line.id??line.stock_item_id]??''} onChange={e=>{setCounts(previous=>({...previous,[line.id??line.stock_item_id]:e.target.value}));setReview(null);}} placeholder="Não contado"/></td><td>{(counts[line.id??line.stock_item_id]??'')===''?'Não contado':number.format(Number(counts[line.id??line.stock_item_id])-Number(line.saldo_referencia))+' '+line.unidade}</td></tr>)}</tbody></table></div></section>
 {pendingItems.length>0&& !newItem&&<p className="users-message" role="status">Itens cadastrados aguardando inclusão na contagem: {pendingItems.map(item=>item.nome).join(', ')}. <button type="button" className="users-secondary" disabled={busy||loading} onClick={()=>includeItems(pendingItems)}>Tentar incluir itens</button></p>}
 {selected.status==='DRAFT'&&<div className="inventory-count-actions"><button className="users-primary" disabled={busy||loading} onClick={()=>action('SAVE')}>Salvar contagem</button><button className="users-secondary" disabled={busy||loading||dirty} onClick={()=>setReview('REBASE')}>Atualizar referência</button>{isAdmin&&<><button className="users-secondary" disabled={busy||loading||dirty||!counted.length||pendingItems.length>0} onClick={()=>setReview('CONFIRM')}>Revisar e confirmar</button><button className="users-secondary" disabled={busy||loading} onClick={()=>setReview('CANCEL')}>Cancelar inventário</button></>}{dirty&&<span>Há alterações não salvas.</span>}</div>}
 {review&&<section className="inventory-review" aria-label="Revisão do inventário"><h3>{review==='CONFIRM'?'Confirmar ajustes de estoque?':review==='REBASE'?'Atualizar os saldos de referência?':'Cancelar este inventário?'}</h3><p>{review==='CONFIRM'?`${counted.length} posições contadas serão conferidos. Itens em branco permanecerão com o saldo atual. Os ajustes serão registrados e a contagem será encerrada.`:review==='REBASE'?'Itens alterados desde a abertura terão a quantidade física apagada para uma nova contagem. Salve antes de atualizar.':'A contagem será encerrada sem alterar os saldos.'}</p>{review==='CONFIRM'&&<ul>{counted.map(line=><li key={line.id}>{line.nome}{line.location_nome?' / '+line.location_nome:''}: {number.format(line.saldo_referencia)} → {number.format(Number(counts[line.id??line.stock_item_id]))} {line.unidade}</li>)}</ul>}<div className="inventory-count-actions"><button className="users-primary" disabled={busy||loading} onClick={()=>action(review)}>{review==='CONFIRM'?'Confirmar inventário':review==='REBASE'?'Atualizar e recontar':'Confirmar cancelamento'}</button><button className="users-secondary" disabled={busy} onClick={()=>setReview(null)}>Voltar</button></div></section>}
 {selected.status==='CONFIRMED'&&<p className="product-note">Confirmado em {new Date(selected.confirmed_at).toLocaleString('pt-BR',{timeZone:'America/Bahia'})}. Histórico preservado; eventuais correções exigem uma nova contagem.</p>}
 </>}
 {newItem&&<ItemForm initialValues={{produto:false,insumo:true}} onClose={closeItem} onSuccess={itemSaved}/>}
 {creating&&<OpenInventory items={items} locations={stocks.locations} onClose={()=>setCreating(false)} onOpened={id=>{setCreating(false);setNotice('Inventário aberto. Informe as quantidades físicas.');load(id);}}/>}
 </div>;
}
