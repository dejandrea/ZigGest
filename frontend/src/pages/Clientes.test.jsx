import React from 'react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Clientes from './Clientes';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const customers=[
 {codigoCliente:1,nome:'Cliente Um',apelido:'Alpha',ativo:true,status:'liberado',limite:100},
 {codigoCliente:2,nome:'Cliente Dois',apelido:'Beta',ativo:false,status:'bloqueado',limite:50}
];
beforeEach(()=>{vi.clearAllMocks();mock.get.mockResolvedValue({data:customers});mock.post.mockResolvedValue({data:{}});});
describe('customers screen',()=>{
 it('shows recent codes first and filters by nickname and inactive status',async()=>{
  render(<Clientes/>);await screen.findByRole('button',{name:'Editar cliente Cliente Dois'});
  const rows=screen.getAllByRole('row');expect(rows[1]).toHaveTextContent('Cliente Dois');
  fireEvent.change(screen.getByLabelText('Buscar clientes'),{target:{value:'Alpha'}});
  expect(screen.queryByRole('button',{name:'Editar cliente Cliente Dois'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  fireEvent.change(screen.getByLabelText('Filtrar clientes'),{target:{value:'inactive'}});
  expect(screen.queryByRole('button',{name:'Editar cliente Cliente Um'})).not.toBeInTheDocument();
 });
 it('creates an active customer in a modal without losing form data on failure',async()=>{
  mock.post.mockRejectedValueOnce(new Error('Fixture validation')).mockResolvedValue({data:{}});
  render(<Clientes/>);await screen.findByRole('button',{name:'Editar cliente Cliente Um'});
  fireEvent.click(screen.getByRole('button',{name:/Novo cliente/}));
  expect(screen.getByRole('dialog')).toHaveAccessibleName('Novo Cliente');
  fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Novo Teste'}});
  fireEvent.click(screen.getByRole('button',{name:'Salvar'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fixture validation');
  expect(screen.getByLabelText('Nome')).toHaveValue('Novo Teste');
  fireEvent.click(screen.getByRole('button',{name:'Salvar'}));
  await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/clientes',expect.objectContaining({nome:'Novo Teste',apelido:'Novo Teste',ativo:true})));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 });
 it('reports a failed query separately from an empty list',async()=>{
  mock.get.mockRejectedValue(new Error('Fixture network error'));render(<Clientes/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os clientes');
  expect(screen.queryByText(/Nenhum cliente cadastrado/)).not.toBeInTheDocument();
 });
});
