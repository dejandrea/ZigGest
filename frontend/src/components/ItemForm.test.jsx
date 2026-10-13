import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ItemForm from './ItemForm';
import {registeredItem} from '../services/catalog';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const stockId='11111111-1111-1111-1111-111111111111';
const cola=registeredItem({_id:'cola',codigoProduto:1,nome:'COCA',unidade:'UN',ativo:true,stockItemId:stockId},
 {_id:stockId,codigoInsumo:2,nome:'COCA',unidade:'UN',ativo:true,fornecedoresIds:[],saldo:12});
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(true);api.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[]}:path==='/itens'?[cola]:[]}));api.post.mockResolvedValue({data:cola});});
async function open(props={}){render(<ItemForm onClose={vi.fn()} onSuccess={vi.fn()} {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Salvar item'})).toBeEnabled());}
it('saves both uses with automatic self consumption and resets after a confirmed continuous save',async()=>{
 const success=vi.fn();await open({onSuccess:success});
 expect(screen.getByRole('checkbox',{name:/Produto —/})).toBeChecked();expect(screen.getByRole('checkbox',{name:/Insumo —/})).toBeChecked();
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Coca'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar e continuar'}));
 await waitFor(()=>expect(success).toHaveBeenCalledWith('Item salvo com sucesso.',cola,true));
 expect(api.post).toHaveBeenCalledWith('/itens',expect.objectContaining({produto:true,insumo:true,componentes:[]}));
 expect(screen.getByLabelText('Nome do item')).toHaveValue('');
});
it('creates a wholesale product using 12 units of an item which is also a product',async()=>{
 await open();fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Pack 12'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Insumo —/}));
 fireEvent.change(screen.getByLabelText('Forma de consumo'),{target:{value:'SINGLE'}});
 fireEvent.change(screen.getByLabelText('Insumo 1'),{target:{value:stockId}});
 fireEvent.change(screen.getByLabelText('Consumo 1'),{target:{value:'12'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/itens',expect.objectContaining({produto:true,insumo:false,componentes:[{stock_item_id:stockId,quantidade:'12'}]})));
});
it('keeps data and request identity after failure and offers stock-only creation',async()=>{
 api.post.mockRejectedValueOnce(new Error('Conexão perdida'));await open({initialValues:{produto:false,insumo:true}});
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Farinha'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));await screen.findByRole('alert');
 expect(screen.getByLabelText('Nome do item')).toHaveValue('Farinha');
 expect(screen.queryByLabelText('Preço de venda (R$)')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
});
it('saves the quantities of several ingredients per unit of a recipe',async()=>{
 const flourId='22222222-2222-2222-2222-222222222222';
 const flour=registeredItem(null,{_id:flourId,codigoInsumo:3,nome:'FARINHA',unidade:'KG',ativo:true});
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[]}:path==='/itens'?[cola,flour]:[]}));
 await open();fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Bolo'}});
 fireEvent.click(screen.getByRole('checkbox',{name:/Insumo —/}));
 fireEvent.change(screen.getByLabelText('Forma de consumo'),{target:{value:'RECIPE'}});
 fireEvent.change(screen.getByLabelText('Insumo 1'),{target:{value:stockId}});
 fireEvent.click(screen.getByRole('button',{name:'Adicionar insumo à receita'}));
 fireEvent.change(screen.getByLabelText('Insumo 2'),{target:{value:flourId}});
 fireEvent.change(screen.getByLabelText('Consumo 2'),{target:{value:'0.5'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/itens',expect.objectContaining({componentes:[{stock_item_id:stockId,quantidade:'1'},{stock_item_id:flourId,quantidade:'0.5'}]})));
});
it('links an existing stock item to an existing product rather than recreating balances',async()=>{
 const legacy=registeredItem({_id:'legacy',codigoProduto:9,nome:'Coca avulsa',unidade:'UN',ativo:true,componentes:[]});
 const stock=registeredItem(null,{_id:stockId,codigoInsumo:2,nome:'Coca estoque',unidade:'UN',ativo:true,saldo:24});
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[]}:path==='/itens'?[legacy,stock]:[]}));
 await open({item:legacy});fireEvent.click(screen.getByRole('checkbox',{name:/Insumo —/}));
 fireEvent.change(screen.getByLabelText('Estoque próprio'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/itens',expect.objectContaining({codigoProduto:9,codigoInsumo:2,produto:true,insumo:true})));
 expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('saldos, notas e históricos'));
});
it('automatically provides own stock for a product supplied by production',async()=>{
 await open({initialValues:{produto:true,insumo:false}});
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Bolo'}});
 fireEvent.change(screen.getByLabelText('Abastecimento / baixa de estoque'),{target:{value:'PRODUCTION'}});
 expect(screen.getByRole('checkbox',{name:/Insumo —/})).toBeChecked();
 expect(screen.queryByLabelText('Forma de consumo')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/itens',expect.objectContaining({produto:true,insumo:true,abastecimento:'PRODUCTION',componentes:[]})));
});
