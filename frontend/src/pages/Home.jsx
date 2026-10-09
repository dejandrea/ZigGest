import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import '../styles/pages/Home.css';
import Icon from '../components/Icon';

const modules = [
  { name:'Clientes', path:'/clientes', icon:'clients', tag:'Cadastros', description:'Consulte e organize os clientes do seu negócio.', action:'Gerenciar clientes' },
  { name:'A receber', path:'/contas', icon:'money', tag:'Financeiro', description:'Registre débitos, créditos e acompanhe os lançamentos.', action:'Ver lançamentos' },
  { name:'Relatórios', path:'/resumo', icon:'report', tag:'Visão geral', description:'Confira os saldos e o resumo das contas dos clientes.', action:'Consultar resumo' },
  { name:'Mesas', path:'/mesas', icon:'table', tag:'Operação', description:'Organize as mesas, seus itens e o atendimento.', action:'Gerenciar mesas' },
];
export default function Home() {
  const navigate=useNavigate();
  const { profile,isAdmin }=useAuth();
  const name=profile?.nome?.trim() || 'Você';
  const firstName=name.split(/\s+/)[0];
  const role=profile?.role==='MASTER'?'Master da plataforma':profile?.role==='ADMIN'?'Administrador':'Operador';
  return (
      <div className="home-content">
        <div className="home-welcome"><div><p className="home-eyebrow">PAINEL INICIAL</p><h1>Olá, {firstName}.</h1><p>Tudo pronto para mais um dia de gestão.</p></div><span className="home-date">{new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',year:'numeric',timeZone:'America/Bahia'}).format(new Date())}</span></div>
        <section className="home-highlight" aria-labelledby="home-highlight-title">
          <div><span className="home-highlight-label">Seu negócio, mais organizado</span><h2 id="home-highlight-title">O próximo passo começa aqui.</h2><p>Acompanhe seus clientes e lançamentos em um só lugar.<br/>Escolha uma área abaixo para começar.</p><button onClick={()=>navigate('/contas')}>Acompanhar lançamentos <span aria-hidden="true">→</span></button></div>
          <div className="home-highlight-art" aria-hidden="true"><div className="home-art-grid"/><div className="home-art-symbol">Z<span>Gestão com clareza</span></div></div>
        </section>
        <section className="home-modules" aria-labelledby="home-modules-title">
          <div className="home-section-heading"><div><h2 id="home-modules-title">O que vamos fazer hoje?</h2><p>Acesso direto às suas principais operações.</p></div><span>Áreas de trabalho</span></div>
          <div className="home-module-grid">{modules.map(item=><button className="home-module-card" key={item.path} onClick={()=>navigate(item.path)} aria-label={item.action}><div className="home-module-top"><span className="home-module-icon"><Icon name={item.icon}/></span><span className="home-module-tag">{item.tag}</span></div><h3>{item.name}</h3><p>{item.description}</p><span className="home-module-action">{item.action}<span aria-hidden="true">→</span></span></button>)}</div>
        </section>
        <section className="home-account-strip" aria-label="Seu acesso"><div><span className="home-account-icon"><Icon name="users"/></span><div><h2>{profile?.role==='MASTER'?'Você está no controle da plataforma.':'Um espaço para sua equipe.'}</h2><p>{isAdmin?'Gerencie os acessos e mantenha sua equipe organizada.':'Seu acesso permite cuidar dos clientes e das operações.'}</p></div></div>{isAdmin&&<button onClick={()=>navigate('/usuarios')}>Gerenciar usuários <span aria-hidden="true">→</span></button>}</section>
        <footer className="home-footer"><span>ZigGest · Gestão que acompanha você</span><span>{role}</span></footer>
      </div>
  );
}
