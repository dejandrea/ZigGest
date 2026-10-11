import React,{useState} from 'react';
import {Outlet,useLocation,useNavigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthContext';
import Icon from './Icon';
import StockNotifications from './StockNotifications';
import {navigationGroups,navigationTitle} from './navigation';
import '../styles/pages/Home.css';
import '../styles/components/AppLayout.css';
export default function AppLayout() {
  const {profile,isAdmin,signOut}=useAuth();
  const navigate=useNavigate(),{pathname}=useLocation();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [expandedGroup,setExpandedGroup]=useState(null);
  const name=profile?.nome?.trim()||'Você';
  const role=profile?.role==='MASTER'?'Master da plataforma':profile?.role==='ADMIN'?'Administrador':'Operador';
  function go(path){navigate(path);setMenuOpen(false);}
  async function logout(){setBusy(true);setError('');try{await signOut();}catch{setError('Não foi possível sair. Tente novamente.');}finally{setBusy(false);}}
  return <div className="home-shell app-layout">
    <aside className="home-sidebar app-sidebar" aria-label="Menu principal">
      <div className="app-brand-row"><div className="home-brand"><span aria-hidden="true">Z</span><h2>ZigGest</h2></div><button className="app-menu-toggle" aria-expanded={menuOpen} aria-controls="app-navigation" onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?'Fechar menu':'Menu'}</button></div>
      <nav id="app-navigation" className={'home-nav app-navigation'+(menuOpen?' is-open':'')} aria-label="Navegação">
        <button aria-current={pathname==='/'?'page':undefined} onClick={()=>go('/')}><Icon name="home"/>Visão geral</button>
        {navigationGroups.filter(group=>!group.admin||isAdmin).map((group,index)=>{
          const expanded=expandedGroup===group.title;
          const active=group.items.some(item=>item.path===pathname);
          const id='nav-group-'+index;
          return <section className="app-nav-group" key={group.title} aria-label={group.title}>
            <button className={'app-group-toggle'+(active?' has-active-item':'')} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpandedGroup(expanded?null:group.title)}>
              <Icon name={group.items[0].icon}/><span>{group.title}</span><span className="app-group-chevron" aria-hidden="true">{expanded?'\u2303':'\u2304'}</span>
            </button>
            <div id={id} className="app-submenu" hidden={!expanded}>{group.items.map(item=><button key={item.label} aria-label={item.label+(!item.path?' Em breve':'')} disabled={!item.path} aria-current={item.path===pathname?'page':undefined} onClick={()=>item.path&&go(item.path)}><Icon name={item.icon}/><span>{item.label}</span>{!item.path&&<small>Em breve</small>}</button>)}</div>
          </section>;
        })}
      </nav>
      <div className="home-sidebar-bottom"><div className="home-identity"><span className="home-avatar" aria-hidden="true">{name[0].toUpperCase()}</span><div><strong>{name}</strong><small>{role}</small></div></div><button className="home-exit" onClick={logout} disabled={busy}><Icon name="exit"/>{busy?'Saindo…':'Sair do sistema'}</button>{error&&<p className="home-signout-error" role="alert">{error}</p>}</div>
    </aside>
    <main className="home-main"><header className="home-topbar"><div><span className="home-breadcrumb">ZigGest /</span>{navigationTitle(pathname)}</div><button onClick={()=>go('/alterar-senha')}>Minha conta <span aria-hidden="true">↗</span></button></header><StockNotifications/><div className="app-route-content"><Outlet/></div></main>
  </div>;
}
