import React,{useState} from 'react';
import api from '../services/api';
import useOperation from '../hooks/useOperation';
import FormModal,{useFormClose} from './FormModal';
import ModalNovoCliente from './ModalNovoCliente';
import {money} from '../services/finance';
import {selectedItems,itemPaymentTotal,remainingBalance} from '../services/comandaPayments';
export default function ComandaTransferForm({comanda,comandas,customers,onClose,onSuccess}){
 const pdv=comanda.origem==='PDV';
 const [destination,setDestination]=useState(''),[name,setName]=useState(comanda.nome_cliente),[customer,setCustomer]=useState(String(comanda.customer_codigo??'')),[quantities,setQuantities]=useState({}),[review,setReview]=useState(false),[creating,setCreating]=useState(false),[added,setAdded]=useState([]);
 const [request]=useState(()=>crypto.randomUUID()),[newId]=useState(()=>crypto.randomUUID());
 const {busy,error,run}=useOperation(),close=useFormClose(onClose,!!destination||Object.values(quantities).some(Number),busy||creating);
 const destinations=comandas.filter(c=>c.id!==comanda.id&&(c.origem??'COMANDA')==='COMANDA'&&c.status==='aberta'&&c.cash_session_id===comanda.cash_session_id);
 const convert=pdv&&destination==='convert',target=destinations.find(c=>c.id===destination),total=itemPaymentTotal(comanda,quantities);
 function payload(){
  if(!destination)throw new Error('Escolha a comanda de destino.');
  if((convert||destination==='new')&&!name.trim())throw new Error('Informe a identificação da nova comanda.');
  const base={request_id:request,total:Number(comanda.total_geral),paid_total:Number(comanda.paid_total??0),identificacao:name,customer_codigo:customer?Number(customer):null};
  if(convert)return {id:comanda.id,action:'CONVERT',data:base};
  if(Number(comanda.discount_amount??0)!==0||Number(comanda.surcharge_amount??0)!==0)throw new Error('Remova os descontos e acréscimos antes de transferir itens. Converter todo o atendimento preserva os ajustes.');
  const items=selectedItems(comanda,quantities);
  if(!items.length)throw new Error('Selecione pelo menos um item para transferir.');
  if(total>remainingBalance(comanda))throw new Error('Os itens ultrapassam o saldo restante. Pagamentos por valor permanecem na origem.');
  if(destination!=='new'&&!target)throw new Error('Escolha uma comanda aberta.');
  return {id:comanda.id,action:'TRANSFER',data:{...base,destination_id:destination==='new'?newId:destination,new_destination:destination==='new',destination_total:Number(target?.total_geral??0),destination_paid_total:Number(target?.paid_total??0),items}};
 }
 async function prepare(){try{await run(async()=>payload());setReview(true);}catch{/* Keep selection. */}}
 async function finish(){try{const result=await run(()=>api.post('/comandas',payload()));await onSuccess(result.data);}catch{/* Keep review for retry. */}}
 return <><FormModal labelledBy="transfer-title" onClose={close} busy={busy||creating} dirty={!!destination}><div className="users-editor product-editor"><div className="users-editor-heading"><h2 id="transfer-title">Transferir para comanda</h2><button aria-label="Fechar transferência" disabled={busy} onClick={close}>×</button></div>{error&&<p role="alert" className="users-message users-error">{error}</p>}<div className="product-fields"><label className="product-wide">Destino<select value={destination} disabled={busy||review} onChange={e=>setDestination(e.target.value)}><option value="">Selecione</option>{pdv&&<option value="convert">Abrir comanda com todo este atendimento</option>}<option value="new">Nova comanda para os itens selecionados</option>{destinations.map(c=><option key={c.id} value={c.id}>Comanda #{c.sale_record??c.codigo_mesa} · {c.nome_cliente}</option>)}</select></label>
 {(convert||destination==='new')&&<><label className="product-wide">Identificação da nova comanda<input value={name} maxLength={200} disabled={busy||review} onChange={e=>setName(e.target.value)}/></label><div className="product-wide comanda-customer-row"><label>Cliente da nova comanda<select value={customer} disabled={busy||review} onChange={e=>setCustomer(e.target.value)}><option value="">Cliente avulso</option>{[...customers,...added].filter(c=>c.ativo).map(c=><option key={c.codigoCliente} value={c.codigoCliente}>{c.nome}</option>)}</select></label><button className="users-secondary" disabled={busy||review} onClick={()=>setCreating(true)}>+ Novo cliente</button></div></>}
 {convert?<p className="product-wide product-note">Todo o consumo e os pagamentos já registrados continuarão na nova comanda. O saldo será {money(remainingBalance(comanda))}.</p>:<><p className="product-wide product-note">Escolha as quantidades ainda não pagas. Os pagamentos permanecem na origem. Saldo disponível: {money(remainingBalance(comanda))}.</p>{comanda.itens.map(line=><label key={line.id}>{line.descricao} · disponíveis: {line.quantidade-Number(line.quantidade_paga??0)}<input aria-label={'Quantidade a transferir de '+line.descricao} type="number" min="0" max={line.quantidade-Number(line.quantidade_paga??0)} step="1" disabled={busy||review} value={quantities[line.id]??0} onChange={e=>{const qty=Number(e.target.value);if(Number.isSafeInteger(qty)&&qty>=0&&qty<=line.quantidade-Number(line.quantidade_paga??0))setQuantities(rows=>({...rows,[line.id]:qty}));}}/></label>)}<p className="product-wide">Total selecionado: {money(total)}</p></>}
 </div><div className="users-form-actions">{review?<><button className="users-secondary" disabled={busy} onClick={()=>setReview(false)}>Editar transferência</button><button className="users-primary" disabled={busy} onClick={finish}>Confirmar transferência</button></>:<><button className="users-secondary" disabled={busy} onClick={close}>Cancelar</button><button className="users-primary" disabled={busy} onClick={prepare}>Revisar transferência</button></>}</div></div></FormModal>{creating&&<ModalNovoCliente initialName={name} onClose={()=>setCreating(false)} onSuccess={(client,keepOpen)=>{setAdded(rows=>[...rows,client]);setCustomer(String(client.codigoCliente));if(!keepOpen)setCreating(false);}}/>}</>;
}
