import React,{useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import {useAuth} from '../auth/AuthContext';
import CashActionForm from '../components/CashActionForm';
import {money} from '../services/finance';
import {decimalMoney,sumMoney,subtractMoney} from '../services/decimalMoney';
import '../styles/pages/Users.css';
import '../styles/pages/Produtos.css';
import '../styles/pages/Comandas.css';
const date=value=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Bahia'}):'—';
const saleStatus={FINALIZED:'Finalizada',CANCELED:'Cancelada',REOPENED:'Reaberta'};
const movementNames={OPENING:'Abertura / troco',WITHDRAW:'Sangria',SUPPLY:'Suprimento'};

export default function Caixa(){
 const {isAdmin}=useAuth();
 const [data,setData]=useState({sessions:[],comandas:[],finance:{accounts:[],categories:[],methods:[],operations:[]}});
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[notice,setNotice]=useState(''),[reopened,setReopened]=useState(null);
 const [category,setCategory]=useState(''),[opening,setOpening]=useState('0.00'),[origin,setOrigin]=useState('');
 const [request,setRequest]=useState(()=>crypto.randomUUID()),[editor,setEditor]=useState(null),[selected,setSelected]=useState('');
 const [review,setReview]=useState(false),[counted,setCounted]=useState(''),[closingReason,setClosingReason]=useState(''),[closingExpected,setClosingExpected]=useState(0);
 const {busy,error,run}=useOperation();
 async function fetchData(){const [sessions,comandas,finance]=await Promise.all([api.get('/caixa'),api.get('/comandas'),api.get('/financeiro')]);return {sessions:sessions.data,comandas:comandas.data,finance:finance.data};}
 async function load(){setLoading(true);setLoadError('');try{setData(await fetchData());}catch(e){setLoadError(e.message);}finally{setLoading(false);}}
 useEffect(()=>{let active=true;fetchData().then(value=>{if(active)setData(value);}).catch(e=>{if(active)setLoadError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 const defaultAccount=data.finance.accounts.find(a=>a.caixa_padrao&&a.ativo&&a.tipo==='CASH'),account=defaultAccount?.id??'';
 const current=data.sessions.find(s=>s.status==='OPEN'),view=data.sessions.find(s=>s.id===selected)??current??data.sessions[0];
 const open=data.comandas.filter(c=>c.status==='aberta'),activeMethods=data.finance.methods.filter(m=>m.ativo);
 const reversed=new Set(data.finance.operations.map(o=>o.estorno_de).filter(Boolean));
 const payments=data.comandas.flatMap(c=>c.pagamentos.map(p=>({...p,voided:c.sale_voided,cash_session_id:p.cash_session_id??c.encerramento?.cash_session_id}))).filter(p=>!!view&&p.cash_session_id===view.id);
 const validPayments=payments.filter(p=>!p.voided&&(!p.operation_id||!reversed.has(p.operation_id)));
 const total=rows=>sumMoney(rows.map(row=>row.valor));
 let difference=0;try{difference=counted?subtractMoney(counted,closingExpected):0;}catch{difference=NaN;}
 async function start(event){event.preventDefault();try{
  await run(()=>api.post('/caixa',{id:request,action:'OPEN',data:{conta_id:account,categoria_id:category,valor_abertura:decimalMoney(opening),origem_id:origin||null}}));
  setRequest(crypto.randomUUID());setSelected('');setNotice('Caixa aberto. Todas as formas de pagamento ativas estão disponíveis.');await load();
 }catch{/* Preserve opening form. */}}
 async function finish(event){event.preventDefault();try{
  await run(()=>api.post('/caixa',{id:current.id,action:'CLOSE',data:{contado:decimalMoney(counted),esperado:closingExpected,motivo:closingReason.trim()}}));
  setReview(false);setNotice('Caixa fechado. A conferência e o histórico foram registrados.');await load();
 }catch{/* Preserve conference. */}}
 async function invoice(sale,value){try{await run(()=>api.post('/caixa-vendas',{id:sale.id,action:'INVOICE',data:{request_id:crypto.randomUUID(),nota_fiscal:value}}));await load();}catch{/* Keep persisted checkbox. */}}
 async function saved(result){
  const action=editor.action;setEditor(null);
  if(action==='REOPEN'){setNotice(`Venda #${result.number} reaberta. Foi aberta a comanda #${result.comanda_numero} com o mesmo registro da venda.`);setReopened(result.comanda_id_aberta);}
  else{setNotice(action==='CANCEL'?'Venda cancelada. Pagamentos estornados e contas a receber ajustadas.':action==='WITHDRAW'?'Sangria registrada.':'Suprimento registrado.');setReopened(null);}
  await load();
 }
 return <div className="users-page products-page">
  <header className="users-heading"><div><p className="home-eyebrow">FRENTE DE LOJA</p><h1>Caixa</h1><p>Abertura, dinheiro, vendas e conferência do fechamento.</p></div><button className="users-secondary" disabled={loading||busy||!!editor} onClick={load}>Atualizar</button></header>
  {(loadError||error)&&<p role="alert" className="users-message users-error">{loadError||error}</p>}
  {notice&&<div role={reopened?'alert':'status'} className="users-message users-success">{notice}{reopened&&<p><Link to={'/comandas?comanda='+reopened}>Abrir comanda</Link></p>}</div>}
  {loading?<p role="status">Carregando caixa…</p>:!loadError&&<>
   {current?<section><p className="product-note">Caixa aberto em {date(current.opened_at)} · Conta: {data.finance.accounts.find(a=>a.id===current.conta_id)?.nome}.</p>
    <div className="users-stats"><div><span>Troco de abertura</span><strong>{money(current.opening_amount)}</strong></div><div><span>Dinheiro esperado no caixa</span><strong>{money(current.expected_cash)}</strong></div><div><span>Comandas abertas</span><strong>{open.length}</strong></div></div>
    <p className="product-note">Todas as formas de pagamento ativas estão habilitadas. Apenas recebimentos em dinheiro compõem o valor físico do caixa.</p>
    <div className="users-form-actions"><button className="users-secondary" disabled={busy||!!editor||review} onClick={()=>setEditor({action:'WITHDRAW'})}>Sangria</button><button className="users-secondary" disabled={busy||!!editor||review} onClick={()=>setEditor({action:'SUPPLY'})}>Suprimento</button><Link className="users-secondary" to="/comandas">Ver comandas</Link><button className="users-primary" disabled={busy||open.length>0||!!editor||review} onClick={()=>{setClosingExpected(Number(current.expected_cash));setCounted('');setClosingReason('');setReview(true);}}>Fechar caixa</button></div>
    {open.length>0&&<p role="status" className="product-note">Encerre todas as comandas para fechar o caixa.</p>}
    {review&&<section className="users-editor product-editor"><h2>Conferência do fechamento</h2><p>Dinheiro esperado: {money(closingExpected)}</p><form onSubmit={finish}><fieldset className="product-fields" disabled={busy}><label>Dinheiro contado<input required type="number" min="0" step="0.000001" value={counted} onChange={e=>setCounted(e.target.value)}/></label><p className="product-note">Diferença: {counted&&Number.isFinite(difference)?money(difference):'—'}</p><label className="product-wide">Justificativa da diferença<textarea required={!!counted&&difference!==0} minLength={difference!==0?3:undefined} maxLength={2000} value={closingReason} onChange={e=>setClosingReason(e.target.value)}/></label><div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={()=>setReview(false)}>Voltar</button><button className="users-primary">Confirmar fechamento</button></div></fieldset></form></section>}
   </section>:<section className="users-editor product-editor"><h2>Abrir caixa</h2><p className="product-note">Informe o dinheiro disponível para troco. Use o saldo já registrado na conta do caixa ou transfira o valor de outra conta. A abertura não registra receita de venda.</p><form onSubmit={start}><fieldset className="product-fields" disabled={busy}>
    <label>Conta financeira do caixa<input readOnly value={defaultAccount?defaultAccount.nome+' · saldo '+money(defaultAccount.saldo):'Conta caixa indisponível'}/></label>
    <label>Categoria das receitas<select required value={category} onChange={e=>setCategory(e.target.value)}><option value="">Selecione</option>{data.finance.categories.filter(c=>c.ativo&&['INCOME','BOTH'].includes(c.natureza)).map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
    <label>Valor de abertura<input required type="number" min="0" step="0.000001" value={opening} onChange={e=>setOpening(e.target.value)}/></label><label>Origem do troco<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">Já está na conta do caixa</option>{data.finance.accounts.filter(a=>a.ativo&&a.id!==account).map(a=><option key={a.id} value={a.id}>{a.nome} · {money(a.saldo)}</option>)}</select></label>
    <div className="product-wide"><h3>Formas de pagamento</h3><p className="product-note">Todas as formas ativas estão disponíveis automaticamente: {activeMethods.map(m=>m.nome).join(', ')||'nenhuma forma ativa cadastrada'}.</p></div><button className="users-primary" disabled={!activeMethods.length||!account}>Abrir caixa</button>
   </fieldset></form></section>}
   {!!data.sessions.length&&<section className="cash-history"><div className="users-toolbar"><label>Consultar caixa<select value={view?.id??''} onChange={e=>setSelected(e.target.value)}>{data.sessions.map(s=><option key={s.id} value={s.id}>{date(s.opened_at)} · {s.status==='OPEN'?'Aberto':'Fechado'}</option>)}</select></label></div>
    {view?.status==='CLOSED'&&(view.counted_amount==null?<p className="product-note">Este caixa foi encerrado antes da conferência de dinheiro. Não há contagem registrada.</p>:<div className="comanda-balances"><span>Esperado: {money(view.expected_amount)}</span><span>Contado: {money(view.counted_amount)}</span><span>Diferença: {money(view.difference)}</span></div>)}
    <div className="users-stats"><div><span>Recebimentos das comandas</span><strong>{money(total(validPayments.filter(p=>p.operation_id)))}</strong></div><div><span>Vendas lançadas a prazo</span><strong>{money(total(validPayments.filter(p=>p.debito_id)))}</strong></div></div>
    <section className="users-list"><div className="product-list-heading"><h2>Vendas do caixa</h2></div><div className="users-table-wrap"><table><thead><tr><th>Registro</th><th>Cliente / comanda</th><th>Total</th><th>Situação</th><th>Nota fiscal</th><th>Ações</th></tr></thead><tbody>{!(view?.sales??[]).length?<tr><td colSpan={6}>Nenhuma venda finalizada neste caixa.</td></tr>:(view.sales??[]).map(sale=><tr key={sale.id}><td>#{sale.number}<small className="inventory-code">{date(sale.finalized_at)}</small></td><td>{sale.nome_cliente}{sale.reopened_comanda_id&&<div>Comanda aberta na reabertura: #{sale.reopened_comanda_number}{sale.status==='REOPENED'&&<div><Link to={'/comandas?comanda='+sale.reopened_comanda_id}>Abrir comanda</Link></div>}</div>}</td><td>{money(sale.total)}</td><td>{saleStatus[sale.status]}{sale.reason&&<div className="inventory-code">{sale.reason}</div>}</td><td><label className="cash-checkbox"><input type="checkbox" aria-label={'Nota fiscal gerada da venda '+sale.number} checked={!!sale.nota_fiscal} disabled={busy||sale.status!=='FINALIZED'} onChange={e=>invoice(sale,e.target.checked)}/>Gerada</label></td><td>{isAdmin&&view.status==='OPEN'&&sale.status==='FINALIZED'&&<><button className="users-edit" disabled={busy||review} onClick={()=>setEditor({action:'CANCEL',sale})}>Cancelar venda #{sale.number}</button><button className="users-edit" disabled={busy||review} onClick={()=>setEditor({action:'REOPEN',sale})}>Reabrir venda #{sale.number}</button></>}</td></tr>)}</tbody></table></div></section>
    <section className="users-list cash-history"><div className="product-list-heading"><h2>Movimentações de dinheiro</h2></div><div className="users-table-wrap"><table><thead><tr><th>Data</th><th>Operação</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{(view?.movements??[]).map(m=><tr key={m.id}><td>{date(m.created_at)}</td><td>{movementNames[m.kind]}</td><td>{money(m.valor)}</td><td>{m.motivo}</td></tr>)}{!(view?.movements??[]).length&&<tr><td colSpan={4}>Nenhuma movimentação de dinheiro.</td></tr>}</tbody></table></div></section>
    <section className="users-list cash-history"><div className="product-list-heading"><h2>Formas de pagamento</h2></div><div className="users-table-wrap"><table><thead><tr><th>Forma</th><th>Total líquido das comandas</th></tr></thead><tbody>{data.finance.methods.map(method=><tr key={method.id}><td>{method.nome}{!method.ativo?' (inativa)':''}</td><td>{money(total(validPayments.filter(p=>p.forma_id===method.id)))}</td></tr>)}</tbody></table></div></section>
   </section>}
  </>}
  {editor&&<CashActionForm action={editor.action} session={editor.sale?view:current} sale={editor.sale} accounts={data.finance.accounts} onClose={()=>setEditor(null)} onSuccess={saved}/>}
 </div>;
}
