import React from 'react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import ResumoContas,{summarizeCustomers} from './ResumoContas';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const customers=[{codigoCliente:1,nome:'Cliente Um',apelido:'Alpha',totalPendente:999},{codigoCliente:2,nome:'Cliente Dois'}];
const entries=[
 {codigoConta:1,codigoCliente:1,clienteNome:'Cliente Um',tipo:'debito',valor:100,dataLancamento:'2026-10-01T15:00:00Z'},
 {codigoConta:2,codigoCliente:1,clienteNome:'Cliente Um',tipo:'credito',valor:25,dataLancamento:'2026-10-02T15:00:00Z'}
];
beforeEach(()=>{vi.clearAllMocks();mock.get.mockImplementation(path=>Promise.resolve({data:path==='/clientes'?customers:entries}));});
function open(){render(<MemoryRouter><ResumoContas/></MemoryRouter>);}
describe('account summary',()=>{
 it('switches between receivables, payables and bank accounts',async()=>{
  mock.get.mockImplementation(path=>Promise.resolve({data:path==='/clientes'?customers:path==='/contas'?entries:path==='/financeiro'?{accounts:[{id:'bank',nome:'Banco de teste',tipo:'BANK',saldo:30,ativo:true}]}:[]}));
  open();await screen.findByRole('button',{name:'Ver extrato de Cliente Um'});
  fireEvent.click(screen.getByRole('button',{name:'Contas a pagar'}));
  await screen.findByText('Nenhuma parcela encontrada.');
  expect(screen.queryByRole('button',{name:'Ver extrato de Cliente Um'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Contas bancárias'}));
  await screen.findByText('Banco de teste');
  expect(screen.getByRole('button',{name:'Contas bancárias'})).toHaveAttribute('aria-pressed','true');
 });
 it('aggregates ledger cents and retains customers without entries',()=>{
  const result=summarizeCustomers(customers,entries);
  expect(result[0]).toMatchObject({codigoCliente:1,debit:100,credit:25,balance:75,count:2});
  expect(result[1]).toMatchObject({codigoCliente:2,balance:0,count:0});
 });
 it('filters by nickname and opens a customer statement newest first',async()=>{
  open();await screen.findByRole('button',{name:'Ver extrato de Cliente Um'});
  fireEvent.change(screen.getByLabelText('Buscar clientes no resumo'),{target:{value:'Alpha'}});
  expect(screen.queryByRole('button',{name:'Ver extrato de Cliente Dois'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Ver extrato de Cliente Um'}));
  expect(screen.getByLabelText('Selecionar cliente')).toHaveValue('1');
  const rows=within(screen.getByRole('table')).getAllByRole('row');
  expect(rows[1]).toHaveTextContent('#0002');expect(rows[2]).toHaveTextContent('#0001');
  expect(mock.get).toHaveBeenCalledTimes(2);
 });
 it('shows zero-entry customers distinctly from a failed query',async()=>{
  open();await screen.findByRole('button',{name:'Ver extrato de Cliente Dois'});
  fireEvent.click(screen.getByRole('button',{name:'Ver extrato de Cliente Dois'}));
  expect(screen.getByText('Nenhum lançamento para os clientes selecionados.')).toBeInTheDocument();
 });
});
