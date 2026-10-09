import React from 'react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Contas,{ledgerSummary,accountDate} from './Contas';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const entries=[
 {_id:'a',codigoConta:1,codigoCliente:7,clienteNome:'Cliente Teste',tipo:'debito',valor:100,dataVencimento:'2026-10-08T15:00:00Z'},
 {_id:'b',codigoConta:2,codigoCliente:7,clienteNome:'Cliente Teste',tipo:'credito',valor:25,dataVencimento:'2026-10-09T15:00:00Z'}
];
beforeEach(()=>{
 vi.clearAllMocks();mock.get.mockImplementation(path=>Promise.resolve({data:path==='/contas'?entries:[{codigoCliente:7,nome:'Cliente Teste',ativo:true,status:'liberado'}]}));
 mock.post.mockResolvedValue({data:{}});mock.put.mockResolvedValue({data:{}});
});
function open(){render(<MemoryRouter><Contas/></MemoryRouter>);}
describe('receivables screen',()=>{
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
  fireEvent.change(screen.getByLabelText('Cliente'),{target:{value:'7'}});
  // The list filter and editor both use a type label; address the editor by its id.
  fireEvent.change(document.getElementById('account-type'),{target:{value:'credito'}});
  fireEvent.change(screen.getByLabelText('Valor'),{target:{value:'12345'}});
  fireEvent.change(screen.getByLabelText('Data de vencimento'),{target:{value:'2026-10-20'}});
  fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Fixture notes'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
  await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/contas',{codigoCliente:7,tipo:'credito',valor:123.45,observacoes:'Fixture notes',dataVencimento:'2026-10-20'}));
 });
 it('does not describe a failed load as an empty database',async()=>{
  mock.get.mockRejectedValue(new Error('Fixture failure'));open();
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  expect(screen.queryByText(/Nenhum lançamento cadastrado/)).not.toBeInTheDocument();
 });
});
