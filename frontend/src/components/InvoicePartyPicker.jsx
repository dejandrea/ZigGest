import React,{useId,useState} from 'react';
import {formatDocument} from '../utils/contactMasks';
import {matchInvoiceParty,documentDigits} from '../services/recipients';
export default function InvoicePartyPicker({rows,document,label,onSelect,readOnly=false}){
 const [search,setSearch]=useState(''),id=useId(),match=matchInvoiceParty(rows,document),term=search.trim().toLocaleLowerCase('pt-BR');
 const filtered=rows.filter(row=>(row.ativo||row._id===match?._id)&&([row.nome,row.nomeFantasia,formatDocument(row.documento),row.documento].join(' ').toLocaleLowerCase('pt-BR').includes(term)||/^[\d\s./-]+$/.test(term)&&documentDigits(row.documento).includes(documentDigits(term))));
 return <div className="invoice-party-picker">{readOnly?<p role="status">{match?label+' reconhecido: '+match.nome+(match.ativo?'':' (inativo)'):label+' não cadastrado para este documento.'}</p>:<>
  <label htmlFor={id}>Buscar {label.toLocaleLowerCase('pt-BR')} cadastrado<input id={id} placeholder="Nome ou CPF / CNPJ" value={search} onChange={event=>setSearch(event.target.value)}/></label>
  <label>{label} cadastrado<select value={match?._id??''} onChange={event=>{const chosen=rows.find(row=>row._id===event.target.value);if(chosen){onSelect(chosen);setSearch('');}else onSelect(null);}}><option value="">Informar os dados manualmente</option>{filtered.map(row=><option key={row._id} value={row._id}>{row.nome} · {formatDocument(row.documento)||'Sem documento'}{row.ativo?'':' (inativo)'}</option>)}</select></label>
 </>}</div>;
}
