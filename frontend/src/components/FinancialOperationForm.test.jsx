import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import FinancialOperationForm from './FinancialOperationForm';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const config={accounts:[{id:'cash',nome:'Caixa',ativo:true,saldo:100}],categories:[],methods:[{id:'pix',nome:'Pix',ativo:true,conta_padrao_id:'cash'}]};
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:config});api.post.mockResolvedValue({data:{}});});
it('prefills the imported method/default account and permits a partial payment',async()=>{
 const success=vi.fn();render(<FinancialOperationForm initialValues={{tipo:'PAYMENT',parcelaId:'p',valor:'100',maxValue:100,descricao:'NF-e 1',paymentName:'Pix'}} onClose={vi.fn()} onSuccess={success}/>);
 await waitFor(()=>expect(screen.getByLabelText('Conta financeira')).toHaveValue('cash'));
 expect(screen.getByLabelText('Forma de pagamento')).toHaveValue('pix');
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:'30'}});
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 await waitFor(()=>expect(success).toHaveBeenCalled());
 expect(api.post).toHaveBeenCalledWith('/financeiro-movimentacoes',expect.objectContaining({tipo:'PAYMENT',parcelaId:'p',valor:'30',contaId:'cash',formaId:'pix'}));
});
it('does not duplicate a receipt when retrying a lost response',async()=>{
 api.post.mockRejectedValueOnce(new Error('Resposta perdida'));
 render(<FinancialOperationForm initialValues={{tipo:'RECEIPT',debitoId:'d',valor:'10',descricao:'Recebimento',formaId:'pix',contaId:'cash'}} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Registrar movimentação'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida');
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
});
it('links an existing credit without asking for a financial account',async()=>{
 render(<FinancialOperationForm initialValues={{tipo:'ALLOCATION',debitoId:'d',maxValue:40,descricao:'Crédito'}} credits={[{_id:'c',codigoConta:1,aberto:20}]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.queryByLabelText('Conta financeira')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Crédito do cliente'),{target:{value:'c'}});
 expect(screen.getByLabelText('Valor')).toHaveValue(20);
 fireEvent.click(screen.getByRole('button',{name:'Registrar movimentação'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/financeiro-movimentacoes',expect.objectContaining({tipo:'ALLOCATION',debitoId:'d',creditoId:'c',valor:'20.00'})));
 expect(api.get).not.toHaveBeenCalled();
});
