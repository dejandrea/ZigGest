import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import PayableForm from '../../components/PayableForm';
const api=vi.hoisted(()=>({post:vi.fn(),put:vi.fn(),get:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{categories:[]}});api.post.mockResolvedValue({data:{}});});
const draft={sourceId:'entry-1',fornecedorNome:'Fornecedor da nota',fornecedorDocumento:'12345678000195',descricao:'NF-e 1',total:'100.00',parcelas:[{numero:'001',vencimento:'2026-11-01',valor:'50.00',formaPagamento:'Boleto bancário'},{numero:'002',vencimento:'2026-12-01',valor:'50.00',formaPagamento:'Boleto bancário'}]};
it('prefills NF-e installments and saves customer edits with the source link',async()=>{
 const success=vi.fn();render(<PayableForm initialValues={draft} onClose={vi.fn()} onSuccess={success}/>);
 expect(screen.getByLabelText('Fornecedor')).toHaveValue('Fornecedor da nota');
 expect(screen.getByLabelText('Valor da parcela 2')).toHaveValue("50,00");
 fireEvent.change(screen.getByLabelText('Vencimento da parcela 2'),{target:{value:'2026-12-15'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar conta a pagar'}));
 await waitFor(()=>expect(success).toHaveBeenCalled());
 expect(api.post).toHaveBeenCalledWith('/contas-pagar',expect.objectContaining({sourceId:'entry-1',parcelas:[draft.parcelas[0],{...draft.parcelas[1],vencimento:'2026-12-15'}]}));
});
it('keeps the finance form and a stable request after an error',async()=>{
 api.post.mockRejectedValueOnce(new Error('Falha no financeiro'));
 render(<PayableForm initialValues={draft} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Salvar conta a pagar'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Falha no financeiro');
 fireEvent.click(screen.getByRole('button',{name:'Salvar conta a pagar'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
 expect(api.post.mock.calls.every(c=>c[0]==='/contas-pagar')).toBe(true);
});
it('generates monthly installments with exact cents',()=>{
 render(<PayableForm initialValues={draft} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Número de parcelas'),{target:{value:'3'}});
 fireEvent.change(screen.getByLabelText('Primeiro vencimento'),{target:{value:'2026-01-31'}});
 fireEvent.click(screen.getByRole('button',{name:'Gerar parcelas mensais'}));
 expect(screen.getByLabelText('Valor da parcela 1')).toHaveValue("33,34");
 expect(screen.getByLabelText('Vencimento da parcela 2')).toHaveValue('2026-02-28');
});
