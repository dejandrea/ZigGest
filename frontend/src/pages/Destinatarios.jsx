import React,{useState} from 'react';
import useReportData from '../hooks/useReportData';
import RecipientForm from '../components/RecipientForm';
import {formatDocument,formatPhone} from '../utils/contactMasks';
import {documentDigits} from '../services/recipients';
import '../styles/pages/Users.css';
import '../styles/pages/Fornecedores.css';
export default function Destinatarios(){
 const report=useReportData('/destinatarios'),[editor,setEditor]=useState(null),[search,setSearch]=useState(''),[notice,setNotice]=useState(''),[status,setStatus]=useState('ALL');
 const rows=report.data??[],term=search.trim().toLocaleLowerCase('pt-BR'),filtered=rows.filter(row=>([row.nome,row.nomeFantasia,row.documento,formatDocument(row.documento)].join(' ').toLocaleLowerCase('pt-BR').includes(term)||/^[\d\s./-]+$/.test(term)&&row.documento.includes(documentDigits(term)))&&(status==='ALL'||row.ativo===(status==='ACTIVE')));
 return <div className="users-page suppliers-page"><header className="users-heading"><div><p className="home-eyebrow">CADASTROS</p><h1>Destinatários</h1><p>Cadastre os CNPJs dos estabelecimentos que recebem as notas de compra.</p></div><button className="users-primary" onClick={()=>setEditor({})}>Novo destinatário</button></header>
  {report.error&&<p role="alert" className="users-message users-error">{report.error}</p>}{notice&&<p role="status" className="users-message users-success">{notice}</p>}
  <section className="users-list"><div className="users-toolbar"><input aria-label="Buscar destinatários" placeholder="Nome ou CPF / CNPJ" value={search} onChange={event=>setSearch(event.target.value)}/><select aria-label="Situação dos destinatários" value={status} onChange={event=>setStatus(event.target.value)}><option value="ALL">Todos</option><option value="ACTIVE">Ativos</option><option value="INACTIVE">Inativos</option></select><button className="users-secondary" disabled={report.loading} onClick={report.refresh}>Atualizar</button></div><div className="users-table-wrap"><table><thead><tr><th>Destinatário</th><th>Documento / IE</th><th>Contato</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{report.loading?<tr><td colSpan={5}>Carregando destinatários…</td></tr>:filtered.length?filtered.map(row=><tr key={row._id}><td><strong>{row.nome}</strong><div>{row.nomeFantasia}</div></td><td>{formatDocument(row.documento)}<div>IE: {row.inscricaoEstadual||'Não informada'}</div></td><td>{formatPhone(row.telefone)}<div>{row.email}</div></td><td>{row.ativo?'Ativo':'Inativo'}</td><td><button className="users-edit" onClick={()=>setEditor(row)}>Editar destinatário {row.nome}</button></td></tr>):<tr><td colSpan={5}>{report.error?'Lista indisponível.':'Nenhum destinatário encontrado.'}</td></tr>}</tbody></table></div></section>
  <p className="supplier-note">Notas existentes são vinculadas pelo CPF / CNPJ. Alterar o nome do cadastro preserva os dados fiscais originais. Desative destinatários sem apagar o histórico.</p>
  {editor&&<RecipientForm recipient={editor._id?editor:null} onClose={()=>setEditor(null)} onSuccess={(message,_row,keepOpen)=>{setNotice(message);if(!keepOpen)setEditor(null);report.refresh();}}/>}
 </div>;
}
