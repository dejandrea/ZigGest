import {moneyUnits,moneyText,sumMoney} from '../services/decimalMoney';
import React,{useState} from 'react';
import useReportData from '../hooks/useReportData';
import {money} from '../services/finance';
import {formatDocument} from '../utils/contactMasks';
import {documentDigits} from '../services/recipients';
import '../styles/pages/Users.css';
export default function EntradasDestinatarios(){
 const report=useReportData('/entradas-destinatarios'),[start,setStart]=useState(''),[end,setEnd]=useState(''),[document,setDocument]=useState('ALL');
 const invoices=report.data?.invoices??[],recipients=report.data?.recipients??[],groups=new Map();
 for(const row of invoices){const key=documentDigits(row.destinatario_documento)||'NONE';if(!groups.has(key))groups.set(key,{document:key,name:recipients.find(recipient=>recipient.documento===key)?.nome??row.destinatario_nome??'',count:0,cents:0n});}
 for(const recipient of recipients)if(!groups.has(recipient.documento))groups.set(recipient.documento,{document:recipient.documento,name:recipient.nome,count:0,cents:0n});
 const rows=invoices.filter(row=>{const date=new Date(row.data_entrada),day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');return (!start||day>=start)&&(!end||day<=end)&&(document==='ALL'||(documentDigits(row.destinatario_documento)||'NONE')===document);});
 for(const row of rows){const group=groups.get(documentDigits(row.destinatario_documento)||'NONE');group.count++;group.cents+=moneyUnits(row.total);}
 return <div className="users-page"><header className="users-heading"><div><p className="home-eyebrow">RELATÓRIOS</p><h1>Entradas por destinatário</h1><p>Notas recebidas por CPF / CNPJ, com totais financeiros separados por estabelecimento.</p></div><button className="users-secondary" disabled={report.loading} onClick={report.refresh}>Atualizar</button></header>
  {report.error&&<p role="alert" className="users-message users-error">{report.error}</p>}
  <div className="users-toolbar"><label>Entrada de<input type="date" value={start} onChange={event=>setStart(event.target.value)}/></label><label>Entrada até<input type="date" min={start} value={end} onChange={event=>setEnd(event.target.value)}/></label><label>Destinatário<select value={document} onChange={event=>setDocument(event.target.value)}><option value="ALL">Todos os destinatários</option>{[...groups.values()].map(group=><option key={group.document} value={group.document}>{group.document==='NONE'?'Sem destinatário informado':group.name+' · '+formatDocument(group.document)}</option>)}</select></label></div>
  {report.loading?<p role="status">Carregando entradas…</p>:report.data&&<><div className="users-stats"><div><span>Notas na seleção</span><strong>{rows.length}</strong></div><div><span>Total das notas</span><strong>{money(sumMoney(rows.map(row=>row.total)))}</strong></div></div>
   <section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Destinatário</th><th>CPF / CNPJ</th><th>Notas</th><th>Total recebido em notas</th></tr></thead><tbody>{[...groups.values()].filter(group=>group.count).map(group=><tr key={group.document}><td>{group.document==='NONE'?'Sem destinatário informado':group.name}</td><td>{group.document==='NONE'?'—':formatDocument(group.document)}</td><td>{group.count}</td><td>{money(moneyText(group.cents))}</td></tr>)}</tbody></table></div></section>
   <section className="users-list"><div className="users-table-wrap"><table><thead><tr><th>Recebimento / emissão</th><th>Nota / origem</th><th>Fornecedor</th><th>Destinatário fiscal</th><th>Total</th></tr></thead><tbody>{rows.length?rows.map(row=><tr key={row.id}><td>{new Date(row.data_entrada).toLocaleDateString('pt-BR')}<div>Emissão: {new Date(row.emitida_em).toLocaleDateString('pt-BR')}</div></td><td>{row.numero} / Série {row.serie}<div>{row.origem==='MANUAL'?'Manual':'XML'}</div></td><td>{row.emitente_nome}<div>{formatDocument(row.emitente_documento)}</div></td><td>{row.destinatario_nome||'Não informado'}<div>{formatDocument(row.destinatario_documento)}</div></td><td>{money(row.total)}</td></tr>):<tr><td colSpan={5}>Nenhuma entrada encontrada.</td></tr>}</tbody></table></div></section></>}
  <p className="product-note">O filtro usa a data de entrada. Notas antigas aparecem pelo documento fiscal mesmo antes do cadastro do destinatário. A identificação separa as compras; o saldo de estoque continua compartilhado nos setores existentes.</p>
 </div>;
}
