import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Compras from './Compras';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const suppliers=[{_id:'s1',nome:'Fornecedor 1',ativo:true},{_id:'s2',nome:'Fornecedor 2',ativo:true}];
const stock=[{_id:'a',codigoInsumo:1,nome:'Coca',unidade:'UN',saldo:2,estoqueMinimo:5,fornecedoresIds:['s1','s2']},{_id:'b',codigoInsumo:2,nome:'Água',unidade:'UN',saldo:0,estoqueMinimo:2,fornecedoresIds:[]}];
const round={id:'round',numero:1,nome:'Teste cotação',status:'DRAFT',revision:0,created_at:'2026-10-11T12:00:00Z',items:[{item_id:'a',nome:'Coca',unidade:'UN',quantidade:10}],offers:[{supplier_id:'s1',frete:20,desconto:0,validade:'2099-12-31',prazo_dias:2,items:[{item_id:'a',preco_unitario:1}]},{supplier_id:'s2',frete:0,desconto:0,validade:'2099-12-31',prazo_dias:1,items:[{item_id:'a',preco_unitario:2}]}]};
beforeEach(()=>{mock.get.mockReset();mock.post.mockReset();mock.get.mockResolvedValue({data:{items:structuredClone(stock),suppliers,rounds:[structuredClone(round)]}});});
const open=()=>render(<MemoryRouter><Compras/></MemoryRouter>);
it('builds general and supplier lists, preserves unassigned items and editable quantities',async()=>{
 open();await screen.findByText('Coca');expect(screen.getByLabelText('Quantidade a comprar de Coca')).toHaveValue(4);
 fireEvent.click(screen.getByRole('button',{name:'Por fornecedor'}));fireEvent.change(screen.getByLabelText('Fornecedor da lista'),{target:{value:'s1'}});
 expect(screen.queryByText('Água')).not.toBeInTheDocument();expect(screen.getByText('Coca')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Quantidade a comprar de Coca'),{target:{value:'24'}});
 fireEvent.click(screen.getByRole('button',{name:'Cotar seleção (1)'}));expect(screen.getByLabelText('Quantidade cotada de Coca')).toHaveValue(24);
 expect(mock.post).not.toHaveBeenCalled();
});
it('requires saving changes before deciding and uses freight in the total strategy',async()=>{
 open();fireEvent.click(await screen.findByRole('button',{name:'Abrir cotação 1'}));
 expect(screen.getByText(/Fornecedor 2: R\$.*20,00/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Quantidade cotada de Coca'),{target:{value:'5'}});
 expect(screen.getByRole('button',{name:'Definir compra com este critério'})).toBeDisabled();
 mock.post.mockImplementation((_path,body)=>Promise.resolve({data:{...round,revision:1,items:[{...round.items[0],quantidade:5}]}}));
 fireEvent.click(screen.getByRole('button',{name:'Salvar cotação'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Definir compra com este critério'})).toBeEnabled());
 expect(mock.post).toHaveBeenCalledWith('/compras',expect.objectContaining({action:'SAVE',revision:0}));
});
it('preserves the decision request id after a failed response',async()=>{
 mock.post.mockRejectedValue(new Error('Conexão interrompida'));open();fireEvent.click(await screen.findByRole('button',{name:'Abrir cotação 1'}));
 fireEvent.click(screen.getByLabelText('Melhor custo por insumo'));fireEvent.click(screen.getByRole('button',{name:'Definir compra com este critério'}));await screen.findByRole('alert');
 const first=mock.post.mock.calls[0][1];fireEvent.click(screen.getByRole('button',{name:'Definir compra com este critério'}));await waitFor(()=>expect(mock.post).toHaveBeenCalledTimes(2));expect(mock.post.mock.calls[1][1]).toEqual(first);expect(first.data.strategy).toBe('ITEM');
});
