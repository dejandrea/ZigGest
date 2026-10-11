import React,{useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import AccountSummary from '../components/AccountSummary';
import {ledgerSummary,accountDate} from './Contas';
import '../styles/pages/Users.css';
import '../styles/pages/Contas.css';
import '../styles/pages/ResumoContas.css';
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:6});
import {moneyUnits,moneyText} from '../services/decimalMoney';
export function summarizeCustomers(customers,entries){
  const groups=new Map(customers.map(c=>[Number(c.codigoCliente),{...c,debit:0n,credit:0n,count:0}]));
  for(const entry of entries){
    const code=Number(entry.codigoCliente);
    if(!groups.has(code))groups.set(code,{codigoCliente:code,nome:entry.clienteNome||'Cliente não encontrado',debit:0n,credit:0n,count:0});
    const group=groups.get(code);
    group[entry.tipo==='credito'?'credit':'debit']+=moneyUnits(entry.valor);group.count++;
  }
  return [...groups.values()].map(g=>({...g,debit:Number(moneyText(g.debit)),credit:Number(moneyText(g.credit)),balance:Number(moneyText(g.debit-g.credit))})).sort((a,b)=>b.balance-a.balance||a.nome.localeCompare(b.nome,'pt-BR'));
}
export default function ResumoContas({report=false}){
  const [section,setSection]=useState('receivables');
  return <><div className="users-page"><p className="home-eyebrow">{report?'RELATÓRIOS':'FINANCEIRO'}</p><h1>{report?'Relatório financeiro':'Resumo de contas'}</h1><div className="summary-tabs" role="group" aria-label="Seção do resumo">{[['receivables','Contas a receber'],['payables','Contas a pagar'],['banks','Contas bancárias']].map(([key,label])=><button key={key} aria-pressed={section===key} onClick={()=>setSection(key)}>{label}</button>)}</div></div>{section==='receivables'?<ReceivableSummary/>:<AccountSummary key={section} kind={section}/>}</>;
}
function ReceivableSummary(){
  const navigate=useNavigate();
  const [customers,setCustomers]=useState([]),[entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  const [search,setSearch]=useState(''),[selected,setSelected]=useState('all'),[view,setView]=useState('customers');
  async function load(){
    setLoading(true);setError('');
    try{const [clients,ledger]=await Promise.all([api.get('/clientes'),api.get('/contas')]);setCustomers(clients.data);setEntries(ledger.data);setLoaded(true);}
    catch{setError('Não foi possível carregar o resumo de contas. Tente atualizar.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{let active=true;Promise.all([api.get('/clientes'),api.get('/contas')]).then(([clients,ledger])=>{if(active){setCustomers(clients.data);setEntries(ledger.data);setLoaded(true);}}).catch(()=>{if(active)setError('Não foi possível carregar o resumo de contas. Tente atualizar.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const groups=useMemo(()=>summarizeCustomers(customers,entries),[customers,entries]);
  const filtered=useMemo(()=>groups.filter(c=>(selected==='all'||String(c.codigoCliente)===selected)&&[c.nome,c.apelido,c.codigoCliente].join(' ').toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))),[groups,search,selected]);
  const visibleEntries=useMemo(()=>{
    const codes=new Set(filtered.map(c=>Number(c.codigoCliente)));
    return entries.filter(e=>codes.has(Number(e.codigoCliente))).sort((a,b)=>(Date.parse(b.dataLancamento||b.createdAt)||0)-(Date.parse(a.dataLancamento||a.createdAt)||0)||Number(b.codigoConta)-Number(a.codigoConta));
  },[filtered,entries]);
  const totals=ledgerSummary(visibleEntries);
  function statement(code){setSelected(String(code));setSearch('');setView('entries');}
  return <div className="users-page summary-page">
    <header className="users-heading"><div><h2>Contas a receber</h2><p>Uma visão clara dos saldos e das movimentações de cada cliente.</p></div><button className="users-secondary" onClick={()=>navigate('/contas')}>Gerenciar lançamentos <span aria-hidden="true">↗</span></button></header>
    {error&&<p className="users-message users-error" role="alert">{error}</p>}
    <div className="summary-scope"><span className="summary-scope-dot" aria-hidden="true"/>{selected==='all'&&!search?'Visão geral de todos os clientes':'Resumo dos clientes selecionados'}<span>{loaded&&!loading?filtered.length+' clientes · '+visibleEntries.length+' lançamentos':''}</span></div>
    <div className="users-stats accounts-stats" aria-label="Totais do resumo">{[['Total de débitos',totals.debit,'debit'],['Total de créditos',totals.credit,'credit'],['Saldo dos lançamentos',totals.balance,'balance']].map(([label,value,kind])=><div className={'accounts-stat '+kind} key={kind}><div><span>{label}</span><Icon name="money"/></div><strong>{loaded?money.format(value):'—'}</strong><small>{kind==='balance'?'Débitos menos créditos':'Valores dos clientes selecionados'}</small></div>)}</div>
    <section className="users-list summary-list" aria-label="Resumo financeiro" aria-busy={loading}>
      <div className="accounts-list-heading"><div><h2>{view==='customers'?'Saldos por cliente':'Extrato de lançamentos'}</h2><p>{view==='customers'?'Saldos calculados a partir dos débitos e créditos.':'Do lançamento mais recente para o mais antigo.'}</p></div><button className="users-secondary" onClick={load} disabled={loading}>Atualizar</button></div>
      <div className="summary-tabs" role="group" aria-label="Visualização do resumo"><button aria-pressed={view==='customers'} onClick={()=>setView('customers')}>Por cliente</button><button aria-pressed={view==='entries'} onClick={()=>setView('entries')}>Extrato</button></div>
      <div className="users-toolbar summary-toolbar"><div className="users-search"><Icon name="clients"/><input aria-label="Buscar clientes no resumo" placeholder="Nome, apelido ou código do cliente" value={search} onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Selecionar cliente" value={selected} onChange={e=>setSelected(e.target.value)}><option value="all">Todos os clientes</option>{groups.map(c=><option key={c.codigoCliente} value={c.codigoCliente}>{c.nome} · #{c.codigoCliente}</option>)}</select>{(search||selected!=='all')&&<button className="users-edit" onClick={()=>{setSearch('');setSelected('all');}}>Limpar filtros</button>}</div>
      <div className="users-table-wrap"><table><thead>{view==='customers'?<tr><th>Cliente</th><th>Lançamentos</th><th>Débitos</th><th>Créditos</th><th>Saldo</th><th><span className="users-sr-only">Ações</span></th></tr>:<tr><th>Código</th><th>Cliente</th><th>Lançamento</th><th>Vencimento</th><th>Tipo</th><th>Valor</th></tr>}</thead><tbody>
        {loading?<tr><td className="users-empty" colSpan="6"><span role="status">Carregando resumo…</span></td></tr>:!loaded?<tr><td className="users-empty" colSpan="6">Resumo indisponível. Clique em Atualizar para tentar novamente.</td></tr>:view==='customers'?filtered.length?filtered.map(c=><tr key={c.codigoCliente}><td><div className="accounts-customer"><strong>{c.nome}</strong><span>Cliente #{c.codigoCliente}{c.apelido?' · '+c.apelido:''}</span></div></td><td className="summary-count">{c.count}</td><td className="accounts-money">{money.format(c.debit)}</td><td className="accounts-money credito">{money.format(c.credit)}</td><td><span className={'summary-balance '+(c.balance>0?'owed':c.balance<0?'in-credit':'settled')}>{money.format(c.balance)}</span></td><td><button className="users-edit" aria-label={'Ver extrato de '+c.nome} onClick={()=>statement(c.codigoCliente)}>Ver extrato <span aria-hidden="true">↗</span></button></td></tr>):<tr><td className="users-empty" colSpan="6">Nenhum cliente corresponde aos filtros.</td></tr>:visibleEntries.length?visibleEntries.map(e=><tr key={e.codigoConta}><td className="accounts-code">#{String(e.codigoConta).padStart(4,'0')}</td><td><div className="accounts-customer"><strong>{e.clienteNome}</strong><span>Cliente #{e.codigoCliente}</span></div></td><td>{accountDate(e.dataLancamento)}</td><td>{accountDate(e.dataVencimento)}</td><td><span className={'accounts-type '+e.tipo}>{e.tipo==='credito'?'Crédito':'Débito'}</span></td><td className={'accounts-money '+e.tipo}>{money.format(e.valor)}</td></tr>):<tr><td className="users-empty" colSpan="6">Nenhum lançamento para os clientes selecionados.</td></tr>}
      </tbody>{loaded&&!loading&&(view==='customers'?filtered.length:visibleEntries.length)>0&&<tfoot><tr>{view==='customers'?<><th colSpan="2">Total da seleção</th><td>{money.format(totals.debit)}</td><td>{money.format(totals.credit)}</td><td>{money.format(totals.balance)}</td><td/></>:<><th colSpan="5">Saldo da seleção · débitos menos créditos</th><td>{money.format(totals.balance)}</td></>}</tr></tfoot>}</table></div>
      <footer className="users-list-footer"><span>{loaded&&!loading?(view==='customers'?filtered.length+' clientes':visibleEntries.length+' lançamentos'):'Consulta financeira'}</span><span>Valores em reais (BRL)</span></footer>
    </section>
    <div className="summary-explanation"><Icon name="report"/><p><strong>Como interpretar o saldo</strong><br/>Saldo positivo indica valor a receber. Saldo negativo indica crédito do cliente. O resumo utiliza os lançamentos e acompanha os filtros da tela.</p></div>
  </div>;
}
