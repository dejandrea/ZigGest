import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {StockLocations,StockTransfer} from '../../components/StockLocations';
const mock=vi.hoisted(()=>({post:vi.fn(),admin:true}));
vi.mock('../../services/api',()=>({default:mock}));
vi.mock('../../auth/AuthContext',()=>({useAuth:()=>({isAdmin:mock.admin})}));
const locations=[{id:'main',nome:'Principal',principal:true,ativo:true},{id:'kitchen',nome:'Cozinha',ativo:true}];
beforeEach(()=>{mock.admin=true;mock.post.mockReset();mock.post.mockResolvedValue({data:{}});});
it('transfers base units and preserves the request id after a failed response',async()=>{
 mock.post.mockRejectedValueOnce(new Error('Falha de conexão'));const done=vi.fn();
 render(<StockTransfer locations={locations} balances={[{stock_item_id:'cola',location_id:'main',saldo:24}]} items={[{_id:'cola',nome:'Coca',unidade:'UN',ativo:true}]} onClose={vi.fn()} onSuccess={done}/>);
 expect(screen.getByLabelText('Estoque de origem')).toHaveValue('main');
 expect(screen.getByLabelText('Estoque de destino')).not.toHaveTextContent('Principal');
 fireEvent.change(screen.getByLabelText('Estoque de destino'),{target:{value:'kitchen'}});
 fireEvent.change(screen.getByLabelText('Insumo'),{target:{value:'cola'}});
 expect(screen.getByText(/Saldo na origem: 24 UN/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Quantidade (UN)'),{target:{value:'12'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));
 await screen.findByRole('alert');expect(screen.getByLabelText('Quantidade (UN)')).toHaveValue(12);
 const first=mock.post.mock.calls[0][1];
 fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));
 await waitFor(()=>expect(done).toHaveBeenCalledWith('Transferência registrada.'));
 expect(mock.post.mock.calls[1][1]).toEqual(first);
 expect(first).toMatchObject({origem_id:'main',destino_id:'kitchen',item_id:'cola',quantidade:'12'});
});
it('creates a sector without allowing changes to the principal marker',async()=>{
 const done=vi.fn();render(<StockLocations locations={locations} onClose={vi.fn()} onSuccess={done}/>);
 fireEvent.click(screen.getByRole('button',{name:'+ Novo setor'}));fireEvent.change(screen.getByLabelText('Nome do estoque'),{target:{value:'Bar'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar setor'}));await waitFor(()=>expect(done).toHaveBeenCalled());
 expect(mock.post).toHaveBeenCalledWith('/estoques',expect.objectContaining({nome:'Bar',ativo:true}));
 expect(mock.post.mock.calls[0][1]).not.toHaveProperty('principal');
});
it('allows operators to view sectors but hides changes',()=>{
 mock.admin=false;render(<StockLocations locations={locations} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.getByText('Cozinha · Ativo')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'+ Novo setor'})).not.toBeInTheDocument();
});
