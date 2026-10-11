import React,{useState} from 'react';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import FormModal,{useFormClose} from './FormModal';
import {cents} from '../services/payables';
import {money} from '../services/finance';

export default function CashActionForm({action,session,sale,accounts,onClose,onSuccess}){
 const [request]=useState(()=>crypto.randomUUID()),[amount,setAmount]=useState(''),[account,setAccount]=useState(''),[reason,setReason]=useState('');
 const {busy,error,run}=useOperation(),close=useFormClose(onClose,!!amount||!!account||!!reason,busy);
 const movement=['WITHDRAW','SUPPLY'].includes(action);
 const title={WITHDRAW:'Registrar sangria',SUPPLY:'Registrar suprimento',CANCEL:'Cancelar venda',REOPEN:'Reabrir venda'}[action];
 async function save(event){event.preventDefault();try{
  const response=await run(()=>{
   if(reason.trim().length<3)throw new Error('Informe o motivo da operação.');
   const data={request_id:request,motivo:reason.trim()};
   if(movement){data.valor=cents(amount)/100;data.conta_id=account;if(data.valor<=0||!account)throw new Error('Informe valor e conta financeira.');}
   return api.post(movement?'/caixa':'/caixa-vendas',{id:movement?session.id:sale.id,action,data});
  });onSuccess(response.data);
 }catch{/* Preserve operation for retry. */}}
 return <FormModal labelledBy="cash-action-title" onClose={close} busy={busy} dirty={!!amount||!!account||!!reason}><div className="users-editor product-editor"><div className="users-editor-heading"><h2 id="cash-action-title">{title}{sale?' #'+sale.number:''}</h2><button type="button" aria-label="Fechar formulário" disabled={busy} onClick={close}>×</button></div>
  {error&&<p role="alert" className="users-message users-error">{error}</p>}
  <p className="product-note">{movement?`Dinheiro disponível no caixa: ${money(session.expected_cash)}.`:action==='CANCEL'?'Os pagamentos desta venda serão estornados e os débitos a prazo serão anulados. O histórico será preservado.':'Os pagamentos serão estornados e o consumo irá para uma comanda aberta, mantendo o registro da venda. Será necessário pagar novamente ao encerrar a comanda.'}</p>
  <form onSubmit={save}><fieldset className="product-fields" disabled={busy}>
   {movement&&<><label>Valor<input required type="number" min="0.01" step="0.01" max={action==='WITHDRAW'?session.expected_cash:undefined} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{action==='WITHDRAW'?'Conta de destino':'Conta de origem'}<select required value={account} onChange={e=>setAccount(e.target.value)}><option value="">Selecione</option>{accounts.filter(a=>a.ativo&&a.id!==session.conta_id).map(a=><option key={a.id} value={a.id}>{a.nome} · {money(a.saldo)}</option>)}</select></label></>}
   <label className="product-wide">Motivo<textarea required minLength={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="users-form-actions product-wide"><button type="button" className="users-secondary" onClick={close}>Voltar</button><button className="users-primary">Confirmar {action==='WITHDRAW'?'sangria':action==='SUPPLY'?'suprimento':action==='CANCEL'?'cancelamento':'reabertura'}</button></div>
  </fieldset></form>
 </div></FormModal>;
}
