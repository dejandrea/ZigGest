import React from 'react';
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import MovimentacoesEstoque from '../../pages/MovimentacoesEstoque';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
beforeEach(()=>{
 vi.clearAllMocks();api.post.mockResolvedValue({data:{}});
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[],balances:[]}:path==='/insumos'?[{_id:'i1',nome:'Coca',unidade:'UN',ativo:true}]:path==='/produtos'?[{codigoProduto:1,nome:'Pack 12',ativo:true}]:[{id:'m1',created_at:'2026-10-09T10:00:00Z',tipo:'ENTRADA',descricao:'Coca',quantidade:12,fator:12,linhas:[{id:'l1',nome:'Coca',unidade:'UN',quantidade:144,saldo_apos:144}]}]}));
});
it('displays movement history and records an exit by sales product',async()=>{
 render(<MemoryRouter><MovimentacoesEstoque/></MemoryRouter>);await screen.findByText('Coca: +144 UN');
 expect(screen.getByText('Principal · Saldo no setor após registro: 144 UN')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:/Nova movimentação/}));
 fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'SAIDA'}});
 fireEvent.change(screen.getByLabelText('Produto de venda'),{target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('Quantidade vendida'),{target:{value:'2'}});
 fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Saída teste'}});
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/movimentacoes-estoque',expect.objectContaining({tipo:'SAIDA',codigoProduto:'1',quantidade:'2',fator:'1',itemId:''})));
});
