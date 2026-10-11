import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {ProductionForm,RecipeForm} from './ProductionForms';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const items=[{nome:'FARINHA',stockId:'flour',insumo:true,unidade:'KG',ativo:true},{nome:'CUPCAKE',stockId:'c',productId:'cup',produto:true,insumo:true,abastecimento:'PRODUCTION',unidade:'UN',ativo:true},{nome:'BOLO GRANDE',stockId:'b',productId:'cake',produto:true,insumo:true,abastecimento:'PRODUCTION',unidade:'UN',ativo:true}];
const recipe={id:'recipe',revision:2,nome:'MASSA',ativo:true,observacoes:'',inputs:[{item_id:'flour',quantidade:2,custo_unitario:5}],outputs:[{product_id:'cup',quantidade:10},{product_id:'cake',quantidade:2}]};
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(true);api.post.mockResolvedValue({data:{id:'batch'}});});
it('scales the batch, accepts different actual yields and safely retries a failed save',async()=>{
 api.post.mockRejectedValueOnce(new Error('Conexão perdida'));const success=vi.fn();render(<ProductionForm recipe={recipe} items={items} locations={[{id:'k',nome:'Cozinha',ativo:true}]} onClose={vi.fn()} onSuccess={success}/>);
 fireEvent.change(screen.getByLabelText('Lotes da ficha'),{target:{value:'2'}});
 expect(screen.getByText('FARINHA: 4 KG')).toBeInTheDocument();expect(screen.getByLabelText('Quantidade produzida CUPCAKE')).toHaveValue(20);
 fireEvent.change(screen.getByLabelText('Quantidade produzida CUPCAKE'),{target:{value:'24'}});fireEvent.change(screen.getByLabelText('Quantidade produzida BOLO GRANDE'),{target:{value:'0'}});
 fireEvent.change(screen.getByLabelText('Estoque de consumo'),{target:{value:'k'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirmar produção'}));expect(await screen.findByRole('alert')).toHaveTextContent('Conexão perdida');
 fireEvent.click(screen.getByRole('button',{name:'Confirmar produção'}));await waitFor(()=>expect(success).toHaveBeenCalled());
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
 expect(api.post.mock.calls[0][1]).toMatchObject({action:'PRODUCE',revision:2,data:{multiplier:'2',location_id:'k',outputs:[{product_id:'cup',quantidade:'24'},{product_id:'cake',quantidade:'0'}]}});
});
it('does not launch stock movements when production confirmation is declined',()=>{
 window.confirm.mockReturnValue(false);render(<ProductionForm recipe={recipe} items={items} locations={[]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Confirmar produção'}));expect(api.post).not.toHaveBeenCalled();
});
it('registers ingredients and several finished goods as one technical sheet',async()=>{
 render(<RecipeForm items={items} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Nome da ficha'),{target:{value:'Massa'}});
 fireEvent.change(screen.getByLabelText('Ingrediente 1'),{target:{value:'flour'}});fireEvent.change(screen.getByLabelText('Quantidade do ingrediente 1'),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText('Produto produzido 1'),{target:{value:'cup'}});fireEvent.change(screen.getByLabelText('Rendimento previsto 1'),{target:{value:'10'}});
 fireEvent.click(screen.getByRole('button',{name:'Adicionar produto'}));fireEvent.change(screen.getByLabelText('Produto produzido 2'),{target:{value:'cake'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar ficha técnica'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/producao',expect.objectContaining({action:'RECIPE',data:expect.objectContaining({outputs:[{product_id:'cup',quantidade:'10'},{product_id:'cake',quantidade:'1'}]})})));
});
