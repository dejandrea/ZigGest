import React,{useEffect,useState} from 'react';
import api from '../services/api';
import FormModal from '../components/FormModal';
import {logActions,logEntities,logField,logChanges,logValue} from '../services/operationLogs';
import '../styles/pages/Users.css';
import '../styles/pages/OperationLogs.css';
const emptyFilters={search:'',entity:'',action:'',actor:'',from:'',to:''};
const formatter=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Bahia',dateStyle:'short',timeStyle:'medium'});
const date=value=>formatter.format(new Date(value));
const entityLabel=entity=>logEntities[entity]??entity.replace(/^public\./,'').replaceAll('_',' ');
export default function OperationLogs(){
 const [draft,setDraft]=useState(emptyFilters),[filters,setFilters]=useState(emptyFilters);
 const [cursors,setCursors]=useState([null]),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailError,setDetailError]=useState('');
 const cursor=cursors[page];
 useEffect(()=>{
  let active=true;setLoading(true);setError('');
  api.get('/logs',{params:{...filters,...(cursor?{before:cursor}:{})}}).then(({data:result})=>{if(active)setData(result);})
   .catch(cause=>{if(active){setData(null);setError(cause.message||'Não foi possível carregar os registros.');}})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[filters,cursor,refresh]);
 useEffect(()=>{
  if(!selected)return;
  let active=true;setDetail(null);setDetailError('');
  api.get('/logs/'+selected).then(({data:result})=>{if(active)setDetail(result);})
   .catch(cause=>{if(active)setDetailError(cause.message||'Não foi possível carregar os detalhes.');});
  return()=>{active=false;};
 },[selected]);
 const change=(key,value)=>setDraft(previous=>({...previous,[key]:value}));
 function apply(event){
  event.preventDefault();
  if(draft.from&&draft.to&&draft.from>draft.to){setError('A data inicial deve ser anterior ou igual à data final.');return;}
  setFilters({...draft});setCursors([null]);setPage(0);
 }
 function clear(){setDraft(emptyFilters);setFilters({...emptyFilters});setCursors([null]);setPage(0);}
 function update(){setCursors([null]);setPage(0);setRefresh(value=>value+1);}
 function next(){setCursors(previous=>[...previous.slice(0,page+1),data.nextCursor]);setPage(value=>value+1);}
 const changes=detail?logChanges(detail):[];
 return <div className="users-page operation-logs-page">
  <header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>Registros de operações</h1><p>Consulte criações, alterações e exclusões, com responsáveis e detalhes.</p></div><button className="users-secondary" disabled={loading} onClick={update}>Atualizar</button></header>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <section className="users-list" aria-label="Histórico de operações" aria-busy={loading}>
   <form className="users-toolbar operation-logs-filters" onSubmit={apply}>
    <label>Buscar registro<input maxLength={200} value={draft.search} placeholder="Nome, descrição ou código" onChange={event=>change('search',event.target.value)}/></label>
    <label>Área<select value={draft.entity} onChange={event=>change('entity',event.target.value)}><option value="">Todas as áreas</option>{(data?.entities??[]).map(entity=><option key={entity} value={entity}>{entityLabel(entity)}</option>)}</select></label>
    <label>Ação<select value={draft.action} onChange={event=>change('action',event.target.value)}><option value="">Todas as ações</option>{Object.entries(logActions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>Responsável<select value={draft.actor} onChange={event=>change('actor',event.target.value)}><option value="">Todos os responsáveis</option><option value="SYSTEM">Sistema / importação</option>{(data?.actors??[]).map(actor=><option key={actor.id} value={actor.id}>{actor.name}</option>)}</select></label>
    <label>Data inicial<input type="date" value={draft.from} onChange={event=>change('from',event.target.value)}/></label>
    <label>Data final<input type="date" value={draft.to} onChange={event=>change('to',event.target.value)}/></label>
    <button className="users-primary" disabled={loading}>Filtrar</button><button type="button" className="users-secondary" onClick={clear} disabled={loading}>Limpar filtros</button>
   </form>
   <div className="users-table-wrap"><table><thead><tr><th>Data e hora</th><th>Responsável</th><th>Área</th><th>Ação</th><th>Registro</th><th><span className="users-sr-only">Detalhes</span></th></tr></thead><tbody>
    {loading?<tr><td colSpan={6} className="users-empty" role="status">Carregando registros…</td></tr>:!data?<tr><td colSpan={6} className="users-empty">Histórico indisponível. Clique em Atualizar para tentar novamente.</td></tr>:!data.rows.length?<tr><td colSpan={6} className="users-empty">Nenhum registro encontrado para os filtros.</td></tr>:data.rows.map(record=><tr key={record.id}>
     <td>{date(record.occurredAt)}</td><td>{record.actor}</td><td>{entityLabel(record.entity)}</td><td><span className={'operation-log-action '+record.action.toLowerCase()}>{logActions[record.action]??record.action}</span></td>
     <td><strong>{record.description||'Registro '+(record.reference??record.recordId??'—')}</strong>{record.description&&record.reference&&<small className="operation-log-reference">#{record.reference}</small>}</td>
     <td><button className="users-edit" aria-label={'Ver detalhes do registro '+record.id} onClick={()=>setSelected(record.id)}>Ver detalhes ↗</button></td>
    </tr>)}
   </tbody></table></div>
   <footer className="users-list-footer"><span>{data&&!loading?data.rows.length+' registros · mais recentes primeiro':'Histórico de operações'}</span><div className="operation-logs-pagination"><button className="users-secondary" disabled={loading||page===0} onClick={()=>setPage(value=>value-1)}>Anterior</button><span>Página {page+1}</span><button className="users-secondary" disabled={loading||!data?.nextCursor} onClick={next}>Próxima</button></div></footer>
  </section>
  {selected&&<FormModal labelledBy="operation-log-title" onClose={()=>setSelected(null)}><section className="users-editor operation-log-detail">
   <div className="users-editor-heading"><h2 id="operation-log-title">Detalhes da operação #{selected}</h2><button aria-label="Fechar detalhes" onClick={()=>setSelected(null)}>×</button></div>
   {detailError?<p role="alert" className="users-message users-error">{detailError}</p>:!detail?<p role="status">Carregando detalhes…</p>:<>
    <p>{logActions[detail.action]} · {entityLabel(detail.entity)}</p><p>{date(detail.occurredAt)} · {detail.actor}</p>
    <div className="users-table-wrap"><table><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{changes.map(change=><tr key={change.key}><th>{logField(change.key)}</th><td><pre>{logValue(change.before)}</pre></td><td><pre>{logValue(change.after)}</pre></td></tr>)}</tbody></table></div>
    {!changes.length&&<p>Nenhum campo de negócio foi alterado nesta operação.</p>}
   </>}
  </section></FormModal>}
 </div>;
}
