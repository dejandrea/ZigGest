import React,{useEffect,useState,useCallback,useRef} from 'react';
import {useNavigate,useLocation} from 'react-router-dom';
import api from '../services/api';
import {notificationPresentation} from '../services/notifications';
import Icon from './Icon';
import FormModal from './FormModal';
import '../styles/pages/Compras.css';
const categories=['Estoque','Caixa','Contas a pagar','Contas a receber','Clientes'];
export default function SystemNotifications(){
 const navigate=useNavigate(),{pathname}=useLocation(),[alerts,setAlerts]=useState([]),[error,setError]=useState(''),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[category,setCategory]=useState('ALL');
 const mounted=useRef(false),sequence=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++sequence.current;
  try{const {data}=await api.get('/notificacoes');if(mounted.current&&request===sequence.current){setAlerts(data);setError('');}}
  catch{if(mounted.current&&request===sequence.current)setError('Não foi possível atualizar as notificações do sistema.');}
  finally{if(mounted.current&&request===sequence.current)setLoading(false);}
 },[]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;sequence.current++;};},[]);
 useEffect(()=>{refresh();return()=>{sequence.current++;};},[pathname,refresh]);
 useEffect(()=>{let timeout;const update=()=>{clearTimeout(timeout);timeout=setTimeout(refresh,350);};const poll=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('ziggest:data-changed',update);window.addEventListener('focus',poll);const timer=setInterval(poll,60000);return()=>{clearTimeout(timeout);clearInterval(timer);window.removeEventListener('ziggest:data-changed',update);window.removeEventListener('focus',poll);};},[refresh]);
 async function copyAlerts(){try{await navigator.clipboard.writeText('ZigGest - Notificações\n'+alerts.map(alert=>{const text=notificationPresentation(alert);return '['+alert.category+'] '+text.title+'\n'+text.description;}).join('\n\n'));setNotice('Resumo copiado. Você pode enviar pelo WhatsApp.');}catch{setNotice('Não foi possível copiar o resumo.');}}
 const visible=alerts.filter(alert=>category==='ALL'||alert.category===category);
 return <><button className="stock-bell" aria-haspopup="dialog" aria-label={error?'Notificações indisponíveis':loading?'Carregando notificações':`Notificações: ${alerts.length}`} onClick={()=>{setOpen(true);setNotice('');refresh();}}><Icon name="bell"/><span>{error?'!':loading?'…':alerts.length}</span></button>
 {open&&<FormModal labelledBy="system-alert-title" onClose={()=>setOpen(false)}><div className="users-editor product-editor">
  <div className="users-editor-heading"><h2 id="system-alert-title">Notificações do sistema</h2><button aria-label="Fechar notificações" onClick={()=>setOpen(false)}>×</button></div>
  {error&&<p role="alert">{error} <button onClick={refresh}>Tentar novamente</button></p>}{loading&&<p role="status">Carregando notificações…</p>}
  <div className="system-alert-filters" role="group" aria-label="Filtrar notificações"><button className="users-secondary" aria-pressed={category==='ALL'} onClick={()=>setCategory('ALL')}>Todas ({alerts.length})</button>{categories.map(value=><button className="users-secondary" key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{value} ({alerts.filter(alert=>alert.category===value).length})</button>)}</div>
  {!error&&!loading&&!visible.length&&<p>{alerts.length?'Nenhuma notificação nesta categoria.':'Nenhuma notificação pendente.'}</p>}
  <ul className="stock-alert-list">{visible.map(alert=>{const text=notificationPresentation(alert);return <li key={alert.id}><div className="system-alert-heading"><span className={'system-alert-category '+(alert.severity==='URGENT'?'urgent':'')}>{alert.category}</span><strong>{text.title}</strong></div><p>{text.description}</p><button className="users-edit" onClick={()=>{setOpen(false);navigate(text.path);}}>{text.action}</button></li>;})}</ul>
  {alerts.length>0&&!error&&<button className="users-secondary" onClick={copyAlerts}>Copiar resumo dos alertas</button>}{notice&&<p role="status">{notice}</p>}
  <p className="product-note">Contas a pagar próximas: hoje e os próximos 7 dias. Vencidas: antes de hoje. Caixa: aberto há mais de 24 horas. Estoque: saldo consolidado dos setores. Os avisos deixam de aparecer quando a pendência é resolvida.</p>
 </div></FormModal>}</>;
}
