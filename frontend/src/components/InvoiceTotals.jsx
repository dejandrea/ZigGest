import React from 'react';
import {invoiceTotals,invoiceAdjustmentFields} from '../services/invoiceTotals';
export default function InvoiceTotals({total,items,onChange,readOnly=false,adjustments={},onAdjustmentChange}){
 const totals=invoiceTotals(total,items,adjustments);
 return <section className="product-wide invoice-section invoice-totals" aria-labelledby="invoice-totals-title">
  <h3 id="invoice-totals-title">Conferência dos valores</h3>
  <div className="invoice-adjustments-grid">{invoiceAdjustmentFields.map(([key,label])=><label key={key}>{label}<input type="number" min="0" step="0.01" value={adjustments[key]??'0'} readOnly={readOnly} onChange={e=>onAdjustmentChange?.(key,e.target.value)}/></label>)}</div>
  <p className="invoice-reconciliation">Itens + frete + impostos + acréscimos − descontos. Informe em impostos apenas os valores adicionados ao total; tributos já incluídos no preço não devem ser somados novamente.</p>
  <div className="invoice-totals-grid">
   <label>Valor total da nota<input type="number" required min="0" step="0.01" value={total} readOnly={readOnly} onChange={e=>onChange?.(e.target.value)}/></label>
   <label>Soma dos itens lançados<input type="number" readOnly value={totals.sum} placeholder="—"/></label>
   <label>Total calculado com ajustes<input type="number" readOnly value={totals.calculated} placeholder="—"/></label>
   <label>Diferença (nota − total calculado)<input type="number" readOnly value={totals.difference} placeholder="—"/></label>
  </div>
  <p role="status" className={'invoice-reconciliation '+(totals.matches===true?'is-matched':totals.matches===false?'is-different':'')}>{totals.matches===null?'Preencha o total da nota e os valores dos itens para conferir.':totals.matches?'Conferido: o total da nota corresponde aos itens e ajustes.':'Valores divergentes. Confira os itens, frete, descontos, impostos e acréscimos antes de finalizar.'}</p>
 </section>;
}
