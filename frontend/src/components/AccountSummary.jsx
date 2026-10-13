import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import useReportData from '../hooks/useReportData';
import {accountTypes,money,today} from '../services/finance';

import {sumMoney} from '../services/decimalMoney';
const sum=(rows,key)=>sumMoney(rows.map(row=>row[key]??0));
export default function AccountSummary({kind}){
 const banks=kind==='banks';
 const {data,loading,error,refresh}=useReportData(banks?'/financeiro':'/contas-pagar');
 const [search,setSearch]=useState(''),[status,setStatus]=useState('all'),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const invalid=from&&to&&from>to;
 const matches=value=>value.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
 const rows=banks?(data?.accounts??[]).filter(a=>matches(a.nome)&&(status==='all'||status==='active'&&a.ativo||status==='inactive'&&!a.ativo)):(data??[]).flatMap(p=>p.parcelas.map(part=>({...part,fornecedor:p.fornecedorNome,descricao:p.descricao}))).filter(p=>!invalid&&matches(p.fornecedor+' '+p.descricao)&&(!from||p.vencimento>=from)&&(!to||p.vencimento<=to)&&(status==='all'||status==='open'&&Number(p.aberto)>0||status==='paid'&&Number(p.aberto)===0||status==='overdue'&&Number(p.aberto)>0&&p.vencimento<today()));
 const bankRows=rows.filter(a=>a.tipo==='BANK'),otherRows=rows.filter(a=>a.tipo!=='BANK');
 const totals=banks?[['Saldo bancário',sum(bankRows,'saldo')],['Outras contas financeiras',sum(otherRows,'saldo')],['Saldo total',sum(rows,'saldo')]]:[['Valor das parcelas',sum(rows,'valor')],['Total pago',sum(rows,'pago')],['Em aberto',sum(rows,'aberto')]];
 function accountsTable(accounts,label){return <section className="users-list"><h3>{label}</h3><div className="users-table-wrap"><table><thead><tr><th>Conta</th><th>Tipo</th><th>Situação</th><th>Saldo atual</th></tr></thead><tbody>{accounts.length?accounts.map(a=><tr key={a.id}><td>{a.nome}</td><td>{accountTypes[a.tipo]}</td><td>{a.ativo?'Ativa':'Inativa'}</td><td>{money(a.saldo)}</td></tr>):<tr><td colSpan={4}>Nenhuma conta encontrada.</td></tr>}</tbody></table></div></section>;}
 return <div className="users-page summary-page"><header className="users-heading"><div><h2>{banks?'Contas bancárias':'Contas a pagar'}</h2><p>{banks?'Saldos atuais das contas, com bancos separados de caixa, cartões e carteiras digitais.':'Parcelas por fornecedor, com valores pagos e pendentes.'}</p></div><Link className="users-secondary" to={banks?'/financeiro':'/contas-pagar'}>{banks?'Ver movimentações':'Gerenciar contas a pagar'}</Link></header>
 {error&&<p role="alert" className="users-message users-error">{error}</p>}
 <div className="users-toolbar"><input aria-label="Buscar no resumo" placeholder={banks?'Nome da conta':'Fornecedor ou descrição'} value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filtrar situação do resumo" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todas as situações</option>{(banks?[['active','Ativas'],['inactive','Inativas']]:[['open','Em aberto'],['paid','Pagas'],['overdue','Vencidas']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{!banks&&<><label>Vencimento de<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Vencimento até<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}<button className="users-secondary" disabled={loading} onClick={refresh}>Atualizar</button></div>
 {invalid&&<p role="alert">A data inicial deve ser anterior ou igual à final.</p>}
 <div className="users-stats" aria-label="Totais da seleção">{totals.map(([label,value])=><div key={label}><span>{label}</span><strong>{data&&!loading?money(value):'—'}</strong></div>)}</div>
 {loading?<p role="status">Carregando resumo…</p>:data?banks?<>{accountsTable(bankRows,'Bancos')}{accountsTable(otherRows,'Outras contas financeiras')}</>:<section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Fornecedor / descrição</th><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Pago</th><th>Em aberto</th><th>Situação</th></tr></thead><tbody>{rows.length?rows.map(p=><tr key={p.id}><td>{p.fornecedor}<div>{p.descricao}</div></td><td>{p.numero}</td><td>{p.vencimento.split('-').reverse().join('/')}</td><td>{money(p.valor)}</td><td>{money(p.pago)}</td><td>{money(p.aberto)}</td><td>{Number(p.aberto)===0?'Paga':p.vencimento<today()?'Vencida':Number(p.pago)>0?'Parcial':'Em aberto'}</td></tr>):<tr><td colSpan={7}>Nenhuma parcela encontrada.</td></tr>}</tbody></table></div></section>:<p>Resumo indisponível. Clique em Atualizar para tentar novamente.</p>}
 <p className="product-note">{banks?'Os saldos incluem todo o histórico, inclusive estornos e contas inativas.':'Os totais acompanham os filtros de fornecedor, situação e vencimento.'}</p></div>;
}
