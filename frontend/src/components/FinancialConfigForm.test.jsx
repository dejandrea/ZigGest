import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import FinancialConfigForm from './FinancialConfigForm';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{}});});
it('suggests the initial bank for a new Pix method but permits a custom destination',async()=>{
 render(<FinancialConfigForm kind="methods" accounts={[{id:'bank',nome:'Conta banco',banco_inicial:true,ativo:true},{id:'custom',nome:'Outro banco',ativo:true}]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Pix'}});fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'PIX'}});
 expect(screen.getByLabelText('Conta padrão')).toHaveValue('bank');fireEvent.change(screen.getByLabelText('Conta padrão'),{target:{value:'custom'}});fireEvent.click(screen.getByRole('button',{name:'Salvar configuração'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/financeiro-config/methods',expect.objectContaining({conta_padrao_id:'custom'})));
});
it('allows renaming and changing the seeded bank account',()=>{
 render(<FinancialConfigForm kind="accounts" item={{id:'bank',nome:'Conta banco',tipo:'BANK',ativo:true,banco_inicial:true}} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.getByLabelText('Nome')).toBeEnabled();expect(screen.getByLabelText('Tipo')).toBeEnabled();expect(screen.getByLabelText('Situação')).toBeEnabled();
});
it('protects the default cash account fields',()=>{
 render(<FinancialConfigForm kind="accounts" item={{id:'cash',nome:'Conta caixa',tipo:'CASH',ativo:true,caixa_padrao:true}} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.getByLabelText('Nome')).toBeDisabled();expect(screen.getByLabelText('Tipo')).toBeDisabled();expect(screen.getByLabelText('Situação')).toBeDisabled();
});
it('retains the same account id when retrying opening balance creation',async()=>{
 api.post.mockRejectedValueOnce(new Error('Resposta perdida'));
 render(<FinancialConfigForm kind="accounts" onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Caixa loja'}});
 fireEvent.change(screen.getByLabelText('Saldo inicial'),{target:{value:'100'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar configuração'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida');
 fireEvent.click(screen.getByRole('button',{name:'Salvar configuração'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].id).toBe(api.post.mock.calls[1][1].id);
 expect(api.post.mock.calls[1][1]).toMatchObject({nome:'Caixa loja',saldo_inicial:100});
});
it('generates a new account id after saving and continuing, preserving retry identity',async()=>{
 const saved=vi.fn();
 render(<FinancialConfigForm kind="accounts" onClose={vi.fn()} onSuccess={saved}/>);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Primeira conta'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar e continuar'}));
 await waitFor(()=>expect(screen.getByLabelText('Nome')).toHaveValue(''));
 expect(saved).toHaveBeenCalledWith('Configuração financeira salva.',true);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Segunda conta'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar configuração'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1].id).not.toBe(api.post.mock.calls[1][1].id);
});
it('edits payment method settings for the future PDV',async()=>{
 render(<FinancialConfigForm kind="methods" accounts={[{id:'bank',nome:'Banco',ativo:true}]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Crédito Visa'}});
 fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'CREDIT_CARD'}});
 fireEvent.change(screen.getByLabelText('Conta padrão'),{target:{value:'bank'}});
 fireEvent.change(screen.getByLabelText('Máximo de parcelas'),{target:{value:'6'}});
 fireEvent.change(screen.getByLabelText('Prazo de recebimento (dias)'),{target:{value:'30'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar configuração'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/financeiro-config/methods',expect.objectContaining({tipo:'CREDIT_CARD',conta_padrao_id:'bank',max_parcelas:6,prazo_dias:30,usar_pdv:true})));
});
