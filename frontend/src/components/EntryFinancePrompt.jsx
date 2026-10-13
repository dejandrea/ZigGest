import React from 'react';
import {useNavigate} from 'react-router-dom';
import FormModal from './FormModal';
export default function EntryFinancePrompt({sourceId,onClose}){
 const navigate=useNavigate();
 return <FormModal labelledBy="entry-finance-title" onClose={onClose}><div className="users-editor product-editor"><h2 id="entry-finance-title">Lançar no financeiro?</h2><p>A entrada já foi registrada e o estoque atualizado. Deseja lançar também no contas a pagar?</p><div className="users-form-actions"><button className="users-secondary" onClick={onClose}>Agora não</button><button className="users-primary" onClick={()=>navigate('/contas-pagar?entrada='+encodeURIComponent(sourceId))}>Sim, lançar contas a pagar</button></div></div></FormModal>;
}
