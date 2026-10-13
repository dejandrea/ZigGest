import {it,expect} from 'vitest';
import {remainingBalance,splitBalance,selectedItems,itemPaymentTotal} from './comandaPayments';
const comanda={total_geral:83,paid_total:30,itens:[{id:'coca',quantidade:3,quantidade_paga:1,valor_unitario:8},{id:'cerveja',quantidade:2,valor_unitario:10},{id:'salgadinho',quantidade:4,valor_unitario:5}]};
it('subtracts previous value payments without changing consumption',()=>{expect(remainingBalance(comanda)).toBe(53);});
it('rates in exact cents including rounding and small balances',()=>{
 expect(splitBalance('100.00',3)).toEqual([33.34,33.33,33.33]);
 expect(splitBalance('0.02',3)).toEqual([0.01,0.01,0]);
 expect(()=>splitBalance(100,0)).toThrow('pessoas');expect(()=>splitBalance(100,1.5)).toThrow('pessoas');
});
it('selects only quantities remaining in each line',()=>{
 expect(selectedItems(comanda,{coca:1,cerveja:1,salgadinho:1})).toEqual([{item_id:'coca',quantidade:1},{item_id:'cerveja',quantidade:1},{item_id:'salgadinho',quantidade:1}]);
 expect(itemPaymentTotal(comanda,{coca:1,cerveja:1,salgadinho:1})).toBe(23);
 expect(()=>selectedItems(comanda,{coca:3})).toThrow('quantidades');
 expect(()=>selectedItems(comanda,{cerveja:0.5})).toThrow('quantidades');
});
