import React from 'react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Contas,{ledgerSummary,accountDate} from '../../pages/Contas';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
const entries=[
 {_id:'a',codigoConta:1,codigoCliente:7,clienteNome:'Cliente Teste',tipo:'debito',valor:100,dataVencimento:'2026-10-08T15:00:00Z'},
 {_id:'b',codigoConta:2,codigoCliente:7,clienteNome:'Cliente Teste',tipo:'credito',valor:25,dataVencimento:'2026-10-09T15:00:00Z'}
];
beforeEach(()=>{
 vi.clearAllMocks();mock.get.mockImplementation(path=>Promise.resolve({data:path==='/contas'?entries:[{codigoCliente:7,nome:'Cliente Teste',ativo:true,status:'liberado'}]}));
 mock.post.mockResolvedValue({data:{}});mock.put.mockResolvedValue({data:{}});
});
function open(view='entries'){
 render(<MemoryRouter><Contas/></MemoryRouter>);
 if(view==='entries')fireEvent.click(screen.getByRole('button',{name:'Extrato'}));
}
describe('receivables screen',()=>{
 it('defaults to customer balances ordered by latest entry and opens an exact customer statement',async()=>{
  mock.get.mockResolvedValue({data:[
   {_id:'a',codigoConta:1,codigoCliente:7,clienteNome:'Primeiro',clienteApelido:'Um',tipo:'debito',valor:100,dataLancamento:'2026-10-01T15:00:00Z'},
   {_id:'b',codigoConta:2,codigoCliente:17,clienteNome:'Segundo',tipo:'debito',valor:50,dataLancamento:'2026-10-02T15:00:00Z'},
   {_id:'c',codigoConta:3,codigoCliente:7,clienteNome:'Primeiro',clienteApelido:'Um',tipo:'credito',valor:25,dataLancamento:'2026-10-03T15:00:00Z'},
  ]});
  open('customers');await screen.findByRole('button',{name:'Ver extrato de Primeiro'});
  expect(screen.getByRole('button',{name:'Por cliente'})).toHaveAttribute('aria-pressed','true');
  const customerRows=within(screen.getByRole('table')).getAllByRole('row');
  expect(customerRows[1]).toHaveTextContent('Primeiro');
  expect(customerRows[1]).toHaveTextContent('#7 · Um');
  expect(customerRows[1]).toHaveTextContent(/R\$\s*75,00/);
  expect(customerRows[2]).toHaveTextContent('Segundo');
  fireEvent.click(screen.getByRole('button',{name:'Ver extrato de Primeiro'}));
  const statementRows=within(screen.getByRole('table')).getAllByRole('row');
  expect(statementRows).toHaveLength(3);
  expect(statementRows[1]).toHaveTextContent('#0003');
  expect(statementRows[2]).toHaveTextContent('#0001');
  expect(screen.queryByRole('button',{name:'Editar lançamento 2'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Por cliente'}));
  expect(screen.getByRole('button',{name:'Ver extrato de Segundo'})).toBeInTheDocument();
  expect(mock.get).toHaveBeenCalledTimes(1);
 });
 it('paginates customers from latest to earliest without changing totals',async()=>{
  mock.get.mockResolvedValue({data:Array.from({length:51},(_,index)=>({
   codigoConta:index+1,codigoCliente:index+1,clienteNome:'Pessoa '+(index+1),tipo:'debito',valor:10,
  }))});
  open('customers');await screen.findByRole('button',{name:'Ver extrato de Pessoa 51'});
  expect(screen.getAllByRole('button',{name:/Ver extrato de/})).toHaveLength(50);
  expect(screen.queryByRole('button',{name:'Ver extrato de Pessoa 1'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
  expect(screen.getByRole('button',{name:'Ver extrato de Pessoa 1'})).toBeInTheDocument();
  expect(screen.getByText(/Saldo da seleção: R\$\s*510,00/)).toBeInTheDocument();
 });
 it('paginates rows while keeping full totals and filters without credit linking',async()=>{
  const many = Array.from({length:51},(_,index)=>({
   _id:'row-'+index,codigoConta:index+1,codigoCliente:7,clienteNome:'Cliente Teste',
   tipo:index===0?'credito':'debito',valor:10,dataVencimento:'2026-10-08T15:00:00Z'
  }));
  mock.get.mockResolvedValue({data:many});
  open();await screen.findByRole('button',{name:'Editar lançamento 51'});
  expect(screen.getAllByRole('button',{name:/Editar lançamento/})).toHaveLength(50);
  expect(screen.queryByRole('button',{name:'Editar lançamento 1'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Vincular crédito'})).not.toBeInTheDocument();
  expect(screen.getByText(/Saldo da seleção: R\$\s*490,00/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
  expect(screen.getByRole('button',{name:'Editar lançamento 1'})).toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:/Editar lançamento/})).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Tipo de lançamento'),{target:{value:'debito'}});
  expect(screen.getByRole('button',{name:'Editar lançamento 51'})).toBeInTheDocument();
  expect(screen.queryByRole('navigation',{name:'Paginação de lançamentos'})).not.toBeInTheDocument();
  expect(screen.getByText(/Saldo da seleção: R\$\s*500,00/)).toBeInTheDocument();
  expect(mock.get).toHaveBeenCalledTimes(1);
 });
 it('uses cents for totals and Bahia dates',()=>{
  expect(ledgerSummary([{tipo:'debito',valor:.1},{tipo:'debito',valor:.2},{tipo:'credito',valor:.05}])).toEqual({debit:.3,credit:.05,balance:.25});
  expect(accountDate('2026-10-08T01:00:00Z')).toBe('07/10/2026');
 });
 it('filters entries by type and due date and clears filters',async()=>{
  open();await screen.findByRole('button',{name:'Editar lançamento 2'});
  fireEvent.change(screen.getByLabelText('Tipo de lançamento'),{target:{value:'credito'}});
  expect(screen.queryByRole('button',{name:'Editar lançamento 1'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Vencimento de'),{target:{value:'2026-10-10'}});
  expect(screen.getByText('Nenhum lançamento corresponde aos filtros.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  expect(screen.getByRole('button',{name:'Editar lançamento 1'})).toBeInTheDocument();
 });
 it('saves a credit with the selected customer, amount, date and notes',async()=>{
  open();await screen.findByRole('button',{name:'Editar lançamento 1'});
  fireEvent.click(screen.getByRole('button',{name:/Novo lançamento/}));
  await waitFor(()=>expect(screen.getByLabelText('Cliente')).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('Cliente'),{target:{value:'Teste'}});
  fireEvent.click(screen.getByRole('option',{name:/Cliente Teste/}));
  // The list filter and editor both use a type label; address the editor by its id.
  fireEvent.change(document.getElementById('account-type'),{target:{value:'credito'}});
  fireEvent.paste(screen.getByLabelText('Valor'), {clipboardData:{getData:()=>"123.456789"}});
  fireEvent.change(screen.getByLabelText('Data de vencimento'),{target:{value:'2026-10-20'}});
  fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Fixture notes'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
  await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/contas',{codigoCliente:7,tipo:'credito',valor:123.456789,observacoes:'Fixture notes',dataVencimento:'2026-10-20'}));
 });
 it('does not describe a failed load as an empty database',async()=>{
  mock.get.mockRejectedValue(new Error('Fixture failure'));open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  expect(screen.queryByText(/Nenhum lançamento cadastrado/)).not.toBeInTheDocument();
 });
});
