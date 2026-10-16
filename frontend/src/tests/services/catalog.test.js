import {it,expect} from 'vitest';
import {catalogue,registrationPayload,registrationResult} from '../../services/catalog';
const stockId='11111111-1111-1111-1111-111111111111';
it('unifies an explicitly linked product and stock without merging names or losing history ids',()=>{
 const stocks=[{_id:stockId,nome:'Coca',codigoInsumo:1,ativo:true},{_id:'flour',nome:'Farinha',codigoInsumo:2,ativo:true}];
 const products=[{_id:'cola',nome:'Coca',codigoProduto:3,stockItemId:stockId,ativo:true},{_id:'pack',nome:'Coca',codigoProduto:4,ativo:true}];
 const result=catalogue(products,stocks);
 expect(result).toHaveLength(3);
 expect(result[0]).toMatchObject({produto:true,insumo:true,productId:'cola',stockId,codigoProduto:3,codigoInsumo:1});
 expect(result[1]).toMatchObject({produto:true,insumo:false});
 expect(result[2]).toMatchObject({produto:false,insumo:true});
});
it('builds a guarded payload and leaves the 1:1 recipe to the database',()=>{
 const payload=registrationPayload({requestId:'req',nome:' Coca ',produto:true,insumo:true,unidade:'UN',componentes:[{stock_item_id:'spoofed',quantidade:99}],saldo:999,role:'MASTER',fornecedoresIds:['s1','']});
 expect(payload.p_data).toMatchObject({product:{nome:'COCA',unidade:'UN'},stock:{nome:'COCA',unidade:'UN'},components:[],suppliers:['s1']});
 expect(payload.p_data.stock).not.toHaveProperty('saldo');
 expect(payload.p_data.product).not.toHaveProperty('role');
});
it('allows wholesale and recipe quantities to reference items which also sell',()=>{
 const payload=registrationPayload({produto:true,insumo:false,nome:'Atacado',componentes:[{stock_item_id:stockId,quantidade:'12'}]});
 expect(payload.p_data.components).toEqual([{stock_item_id:stockId,quantidade:12}]);
 expect(()=>registrationPayload({produto:false,insumo:false})).toThrow('Marque');
});
it('maps the atomic response back into a single item and the stock used by invoice entry',()=>{
 const result=registrationResult({product:{id:'p',codigo_produto:1,stock_item_id:stockId,nome:'COCA',unidade:'UN',ativo:true},stock:{id:stockId,codigo_insumo:2,nome:'COCA',unidade:'UN',saldo:5,ativo:true}});
 expect(result).toMatchObject({produto:true,insumo:true,stockId,productId:'p',saldo:5});
 expect(result._stock._id).toBe(stockId);
});
