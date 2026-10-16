import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import api from '../../services/api';
import ContasPagar from '../../pages/ContasPagar';
import EntryFinancePrompt from '../../components/EntryFinancePrompt';
vi.mock('../../services/api',()=>({default:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
it('records a partial payment and refreshes the remaining balance without allowing edits',async()=>{
 const account={id:'payable',fornecedorNome:'Fornecedor teste',descricao:'Compra teste',total:'100',parcelas:[{id:'part',numero:'1',vencimento:'2026-12-01',valor:'100',formaPagamento:'Pix',pago:0,aberto:100}]};
 const config={accounts:[{id:'bank',nome:'Banco',ativo:true,saldo:200}],methods:[{id:'pix',nome:'Pix',ativo:true,conta_padrao_id:'bank'}],categories:[]};
 api.get.mockImplementation(path=>Promise.resolve({data:path==='/contas-pagar'?[account]:path==='/financeiro'?config:[]}));
 api.post.mockImplementation(()=>{account.locked=true;account.parcelas[0].pago=30;account.parcelas[0].aberto=70;return Promise.resolve({data:{}});});
 render(<MemoryRouter><ContasPagar/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Pagar parcela'}));
 await waitFor(()=>expect(screen.getByLabelText('Conta financeira')).toHaveValue('bank'));
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:"30,00"}});
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 expect(await screen.findByText('Em aberto: R$ 70,00')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Editar lançamento'})).toBeDisabled();
 expect(api.post).toHaveBeenCalledWith('/financeiro-movimentacoes',expect.objectContaining({tipo:'PAYMENT',parcelaId:'part',valor:'30.00'}));
});
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(path=>Promise.resolve({data:path.startsWith('/financeiro-entrada')?{sourceId:'entry-1',fornecedorNome:'Fornecedor NF',descricao:'NF-e 123',total:'96',parcelas:[{numero:'001',vencimento:'2026-12-01',valor:'96',formaPagamento:'Boleto bancário'}]}:[]}));api.post.mockResolvedValue({data:{}});});
it('opens finance from the saved entry with supplier, total and due date prefilled',async()=>{
 render(<MemoryRouter initialEntries={['/stock']}><Routes><Route path="/stock" element={<EntryFinancePrompt sourceId="entry-1" onClose={vi.fn()}/>}/><Route path="/contas-pagar" element={<ContasPagar/>}/></Routes></MemoryRouter>);
 expect(api.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Sim, lançar contas a pagar'}));
 expect(await screen.findByLabelText('Fornecedor')).toHaveValue('Fornecedor NF');
 expect(screen.getByLabelText('Valor total')).toHaveValue("96,00");
 expect(screen.getByLabelText('Vencimento da parcela 1')).toHaveValue('2026-12-01');
 fireEvent.click(await screen.findByRole('button',{name:'Salvar conta a pagar'}));
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
