import {it,expect} from 'vitest';
import {productionPayload,productionPreview} from '../../services/production';
it('normalizes only production fields and preserves zero output for unused sizes',()=>{
 expect(productionPayload({action:'PRODUCE',data:{recipe_id:'recipe',multiplier:'2',outputs:[{product_id:'cup',quantidade:'24'},{product_id:'large',quantidade:'0'}],saldo:999,total_cost:1}})).toEqual({recipe_id:'recipe',multiplier:2,location_id:null,extra_cost:0,ocorrido_em:null,observacoes:'',outputs:[{product_id:'cup',quantidade:24},{product_id:'large',quantidade:0}]});
 expect(()=>productionPayload({action:'PRODUCE',data:{multiplier:'1',outputs:[{quantidade:'-1'}]}})).toThrow('Quantidade');
});
it('scales ingredients and expected output once per batch without adding different units',()=>{
 const result=productionPreview({inputs:[{item_id:'flour',quantidade:2,custo_unitario:5},{item_id:'milk',quantidade:1,custo_unitario:3}],outputs:[{product_id:'cup',quantidade:10},{product_id:'cake',quantidade:2}]},2);
 expect(result.inputs.map(line=>line.quantidade)).toEqual([4,2]);expect(result.outputs.map(line=>line.quantidade)).toEqual([20,4]);expect(result.cost).toBe(26);
});
