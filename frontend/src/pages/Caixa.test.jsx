import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Caixa from './Caixa';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
beforeEach(()=>{vi.clearAllMocks();mock.post.mockResolvedValue({data:{}});});
const finance={accounts:[{id:'cash',nome:'Caixa físico',ativo:true}],categories:[{id:'sales',nome:'Vendas',natureza:'INCOME',ativo:true}],methods:[{id:'pix',nome:'Pix',tipo:'PIX',ativo:true,usar_pdv:true}],operations:[]};
it('keeps cash closing disabled while comandas are open',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'session',status:'OPEN',conta_id:'cash',method_ids:['pix'],opened_at:'2026-10-11T03:00:00Z'}]:path==='/comandas'?[{id:'c1',status:'aberta',pagamentos:[]}]:finance}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);await screen.findByRole('button',{name:'Fechar caixa'});expect(screen.getByRole('button',{name:'Fechar caixa'})).toBeDisabled();expect(mock.post).not.toHaveBeenCalled();
});
it('opens cash with explicitly selected account, category and payment methods',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/financeiro'?finance:[]}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);await screen.findByLabelText('Conta financeira padrão');
 fireEvent.change(screen.getByLabelText('Conta financeira padrão'),{target:{value:'cash'}});fireEvent.change(screen.getByLabelText('Categoria das receitas'),{target:{value:'sales'}});fireEvent.click(screen.getByLabelText('Pix'));fireEvent.click(screen.getByRole('button',{name:'Abrir caixa'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa',expect.objectContaining({action:'OPEN',data:{conta_id:'cash',categoria_id:'sales',method_ids:['pix']}})));
});
it('includes payments from comandas that are still open in cash totals',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'session',status:'OPEN',conta_id:'cash',method_ids:['pix'],opened_at:'2026-10-11T03:00:00Z'}]:path==='/comandas'?[{id:'c1',status:'aberta',pagamentos:[{id:'p1',cash_session_id:'session',forma_id:'pix',valor:30,operation_id:'income'}]}]:finance}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);
 await screen.findByRole('button',{name:'Fechar caixa'});
 expect(screen.getByRole('cell',{name:/30,00/})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Fechar caixa'})).toBeDisabled();
});
