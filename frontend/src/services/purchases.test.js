import {it,expect} from 'vitest';
import {comparison,lineCents,suggestedQuantity,quotationPayload} from './purchases';
const items=[{item_id:'a',nome:'Coca',unidade:'UN',quantidade:10},{item_id:'b',nome:'Água',unidade:'UN',quantidade:10}];
const suppliers=[{_id:'s1',nome:'Fornecedor 1',ativo:true},{_id:'s2',nome:'Fornecedor 2',ativo:true},{_id:'s3',nome:'Fornecedor 3',ativo:true}];
const offer=(id,prices,frete=0,desconto=0)=>({supplier_id:id,frete,desconto,validade:'2026-12-31',prazo_dias:2,items:Object.entries(prices).map(([item_id,preco_unitario])=>({item_id,preco_unitario}))});
it('compares full costs, avoids incomplete baskets and separately suggests unit prices',()=>{
 const r=comparison(items,[offer('s1',{a:1,b:3},20),offer('s2',{a:2,b:2}),offer('s3',{a:0.5})],suppliers,'2026-10-11');
 expect(r.bestTotal.supplier_id).toBe('s2');expect(r.bestTotal.total).toBe(4000);
 expect(r.perItem.map(i=>i.best.supplier_id)).toEqual(['s3','s2']);expect(r.splitTotal).toBe(2500);
});
it('charges freight once and does not reuse a whole-proposal discount on a partial order',()=>{
 const r=comparison(items,[offer('s1',{a:1,b:10},5,8),offer('s2',{a:5,b:2},3)],suppliers,'2026-10-11');
 expect(r.splitTotal).toBe(3800);expect(r.groups.every(g=>g.discount===0)).toBe(true);
});
it('excludes expired/inactive suppliers and exposes missing coverage',()=>{
 const expired={...offer('s1',{a:0.1,b:0.1}),validade:'2026-10-10'};
 const r=comparison(items,[expired,offer('s2',{a:1,b:1}),offer('s3',{a:2})],suppliers.map(s=>({...s,ativo:s._id!=='s2'})),'2026-10-11');
 expect(r.bestTotal).toBeUndefined();expect(r.completeSplit).toBe(false);expect(r.perItem[1].best).toBeUndefined();
});
it('rounds each line exactly with fractional quantities and four decimal unit prices',()=>{
 expect(lineCents('1.005','1')).toBe(101);expect(lineCents('0.125','3.9999')).toBe(50);
 expect(()=>lineCents('10','9999999999')).toThrow('limite');
});
it('replenishes above the minimum using the base unit and covers negative stock',()=>{
 expect(suggestedQuantity({unidade:'UN',saldo:5,estoqueMinimo:5})).toBe(1);
 expect(suggestedQuantity({unidade:'UN',saldo:-2,estoqueMinimo:5})).toBe(8);
 expect(suggestedQuantity({unidade:'KG',saldo:1,estoqueMinimo:2})).toBe(1.001);
});
it('keeps uncoted items out of proposals and rejects duplicate suppliers or zero prices',()=>{
 const f={nome:'Reposição',items,offers:[{supplier_id:'s1',frete:'0',desconto:'0',validade:'2026-12-31',prazo_dias:'2',prices:{a:'1.2345',b:''}}]};
 expect(quotationPayload(f).offers[0].items).toEqual([{item_id:'a',preco_unitario:'1.2345'}]);
 expect(()=>quotationPayload({...f,offers:[f.offers[0],f.offers[0]]})).toThrow('diferentes');
 expect(()=>quotationPayload({...f,offers:[{...f.offers[0],prices:{a:'0'}}]})).toThrow('maior que zero');
});
