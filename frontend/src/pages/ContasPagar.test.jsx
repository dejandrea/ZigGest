import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import api from '../services/api';
import ContasPagar from './ContasPagar';
import EntryFinancePrompt from '../components/EntryFinancePrompt';
vi.mock('../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(path=>Promise.resolve({data:path.startsWith('/financeiro-entrada')?{sourceId:'entry-1',fornecedorNome:'Fornecedor NF',descricao:'NF-e 123',total:'96',parcelas:[{numero:'001',vencimento:'2026-12-01',valor:'96',formaPagamento:'Boleto bancário'}]}:[]}));api.post.mockResolvedValue({data:{}});});
it('opens finance from the saved entry with supplier, total and due date prefilled',async()=>{
 render(<MemoryRouter initialEntries={['/stock']}><Routes><Route path="/stock" element={<EntryFinancePrompt sourceId="entry-1" onClose={vi.fn()}/>}/><Route path="/contas-pagar" element={<ContasPagar/>}/></Routes></MemoryRouter>);
 expect(api.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Sim, lançar contas a pagar'}));
 expect(await screen.findByLabelText('Fornecedor')).toHaveValue('Fornecedor NF');
 expect(screen.getByLabelText('Valor total')).toHaveValue(96);
 expect(screen.getByLabelText('Vencimento da parcela 1')).toHaveValue('2026-12-01');
 fireEvent.click(screen.getByRole('button',{name:'Salvar conta a pagar'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/contas-pagar',expect.objectContaining({sourceId:'entry-1',total:'96'})));
});
it('declining finance leaves the entry untouched and creates no payable',()=>{
 const close=vi.fn();render(<MemoryRouter><EntryFinancePrompt sourceId="entry-1" onClose={close}/></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'Agora não'}));
 expect(close).toHaveBeenCalled();expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
it('does not open a new payable if the source already has one',async()=>{
 api.get.mockImplementation(path=>path.startsWith('/financeiro-entrada')?Promise.reject(new Error('Esta entrada já possui lançamento no contas a pagar.')):Promise.resolve({data:[]}));
 render(<MemoryRouter initialEntries={['/contas-pagar?entrada=entry-1']}><ContasPagar/></MemoryRouter>);
 expect(await screen.findByRole('alert')).toHaveTextContent('já possui lançamento');
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
