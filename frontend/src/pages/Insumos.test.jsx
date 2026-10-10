import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Insumos from './Insumos';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const rows=[{_id:'i1',codigoInsumo:1,nome:'Coca-Cola lata',unidade:'UN',saldo:144,estoqueMinimo:12,ativo:true},{_id:'i2',codigoInsumo:2,nome:'Pão',unidade:'UN',saldo:0,estoqueMinimo:5,ativo:true}];
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:rows});api.post.mockResolvedValue({data:{}});api.put.mockResolvedValue({data:{}});});
it('shows the shared balance and filters low-stock items',async()=>{
 render(<Insumos overview/>);await screen.findByText('Coca-Cola lata');
 expect(screen.getByText('144 UN')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar estoque'),{target:{value:'low'}});
 expect(screen.queryByText('Coca-Cola lata')).not.toBeInTheDocument();
 expect(screen.getByText('Pão')).toBeInTheDocument();
});
it('creates a base item without setting its balance directly',async()=>{
 render(<Insumos/>);await screen.findByText('Coca-Cola lata');
 fireEvent.click(screen.getByRole('button',{name:/Novo item/}));
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Água mineral'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/insumos',expect.objectContaining({nome:'Água mineral',unidade:'UN',estoqueMinimo:'0'})));
 expect(api.post.mock.calls[0][1]).not.toHaveProperty('saldo');
});
it('converts 12 packs of 12 and safely reuses a request after a failed response',async()=>{
 api.post.mockRejectedValueOnce(new Error('Falha de conexão'));
 render(<Insumos/>);await screen.findByText('Coca-Cola lata');
 fireEvent.click(screen.getByRole('button',{name:'Entrada de Coca-Cola lata'}));
 fireEvent.change(screen.getByLabelText('Quantidade de embalagens'),{target:{value:'12'}});
 fireEvent.change(screen.getByLabelText('Unidades por embalagem'),{target:{value:'12'}});
 fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Compra teste'}});
 expect(screen.getByText(/Entrada: 144 UN/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Falha de conexão');
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
 expect(api.post.mock.calls[0][1]).toMatchObject({tipo:'ENTRADA',quantidade:'12',fator:'12',itemId:'i1'});
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('keeps the base unit immutable in the edit form',async()=>{
 render(<Insumos/>);await screen.findByText('Coca-Cola lata');
 fireEvent.click(screen.getByRole('button',{name:'Editar item Coca-Cola lata'}));
 expect(screen.getByLabelText('Unidade de estoque')).toBeDisabled();
});
