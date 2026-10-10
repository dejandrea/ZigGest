import React,{useEffect,useState} from 'react';
import api from '../services/api';
import FormModal from './FormModal';
import '../styles/pages/InvoiceEntry.css';
const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4});
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
export default function InvoiceDetails({id,onClose}){
 const [invoice,setInvoice]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/entradas-nfe/'+id).then(({data})=>{if(active)setInvoice(data);}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[id]);
 function download(){
  const xml=invoice.xml_original.replace(/(<\?xml[^?]*encoding\s*=\s*["'])[^"']+/i,'$1UTF-8');
  const url=URL.createObjectURL(new Blob([xml],{type:'application/xml;charset=utf-8'})),link=document.createElement('a');
  link.href=url;link.download='NFe-'+invoice.chave+'.xml';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <FormModal labelledBy="invoice-details-title" onClose={onClose}><div className="users-editor invoice-editor"><div className="users-editor-heading"><h2 id="invoice-details-title">NF-e registrada</h2><button type="button" aria-label="Fechar nota" onClick={onClose}>×</button></div>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  {!invoice&&!error&&<p role="status">Carregando nota…</p>}
  {invoice&&<><section className="invoice-summary"><h3>NF-e {invoice.numero} / Série {invoice.serie}</h3><p>Origem: {invoice.origem==='MANUAL'?'Digitada manualmente':'Importada por XML'}</p><p>Fornecedor: {invoice.emitente_nome} · {invoice.emitente_documento}</p>{invoice.destinatario_nome&&<p>Destinatário: {invoice.destinatario_nome} · {invoice.destinatario_documento}</p>}<p>Chave: {invoice.chave||'Não informada'}</p><p>Emissão: {new Date(invoice.emitida_em).toLocaleString('pt-BR')} · Total: {money.format(Number(invoice.total))}</p>{invoice.xml_original&&<button type="button" className="users-secondary" onClick={download}>Baixar XML da NF-e</button>}</section>
   <div className="invoice-items">{invoice.itens.map(item=><section key={item.id} className="invoice-item"><h3>{item.n_item}. {item.descricao}</h3><p>Na nota: {number.format(Number(item.quantidade_nf))} {item.unidade_nf} · Total: {money.format(Number(item.valor_total))}</p><p>Insumo: {item.insumo_nome} · Recebido: {number.format(Number(item.quantidade_recebida))} × {number.format(Number(item.fator))} = {number.format(Number(item.quantidade_estoque))} {item.unidade_estoque}</p></section>)}</div>
  </>}
 </div></FormModal>;
}
