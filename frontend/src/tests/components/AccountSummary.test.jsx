import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import AccountSummary from '../../components/AccountSummary';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
beforeEach(()=>vi.clearAllMocks());
it('separates bank balances from cash and retains inactive balances',async()=>{
 mock.get.mockResolvedValue({data:{accounts:[{id:'1',nome:'Banco principal',tipo:'BANK',saldo:150,ativo:true},{id:'2',nome:'Banco antigo',tipo:'BANK',saldo:-20,ativo:false},{id:'3',nome:'Caixa',tipo:'CASH',saldo:80,ativo:true}]}});
 render(<MemoryRouter><AccountSummary kind="banks"/></MemoryRouter>);
 await screen.findByText('Banco principal');
 const tables=screen.getAllByRole('table');
 expect(within(tables[0]).getByText('Banco antigo')).toBeInTheDocument();
 expect(within(tables[0]).queryByText('Caixa')).not.toBeInTheDocument();
 expect(within(tables[1]).getByText('Caixa')).toBeInTheDocument();
 const totals=screen.getByLabelText('Totais da seleção');expect(totals).toHaveTextContent('130,00');expect(totals).toHaveTextContent('210,00');
});
it('uses the remaining installment amount and filters paid installments',async()=>{
 mock.get.mockResolvedValue({data:[{id:'p',fornecedorNome:'Fornecedor Um',descricao:'NF 10',parcelas:[{id:'1',numero:1,vencimento:'2026-01-01',valor:'100.00',pago:40,aberto:60},{id:'2',numero:2,vencimento:'2026-02-01',valor:'100.00',pago:100,aberto:0}]}]});
 render(<MemoryRouter><AccountSummary kind="payables"/></MemoryRouter>);
 await screen.findByText('Paga');
 expect(screen.getByLabelText('Totais da seleção')).toHaveTextContent('60,00');
 fireEvent.change(screen.getByLabelText('Filtrar situação do resumo'),{target:{value:'paid'}});
 expect(screen.getAllByRole('row')).toHaveLength(2);
 expect(screen.getByLabelText('Totais da seleção')).toHaveTextContent('0,00');
});
it('shows unavailable balances when loading fails',async()=>{
 mock.get.mockRejectedValue(new Error('offline'));
 render(<MemoryRouter><AccountSummary kind="banks"/></MemoryRouter>);
 await screen.findByRole('alert');
 expect(screen.getByLabelText('Totais da seleção')).not.toHaveTextContent('0,00');
 expect(screen.getByText('Resumo indisponível. Clique em Atualizar para tentar novamente.')).toBeInTheDocument();
});
