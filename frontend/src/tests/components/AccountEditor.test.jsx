import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import AccountEditor from '../../components/AccountEditor';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
const customers=[
 {codigoCliente:54,nome:'Índio Da Máquina',apelido:'Oficina',ativo:true,status:'liberado'},
 {codigoCliente:17,nome:'Maria',apelido:'Loja',ativo:true,status:'liberado'},
 {codigoCliente:90,nome:'Inativo',apelido:'Antigo',ativo:false,status:'liberado'},
];
beforeEach(()=>{
 vi.clearAllMocks();
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/clientes'?customers:{categories:[]}}));
 mock.post.mockResolvedValue({data:{}});
});
async function open(conta=null){
 render(<AccountEditor conta={conta} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 const input=screen.getByRole('combobox',{name:'Cliente'});
 await waitFor(()=>expect(input).toBeEnabled());
 return input;
}
it('keeps typed text visible and filters by name, nickname and code',async()=>{
 const input=await open();
 for(const query of ['indio','Oficina','54']){
  fireEvent.change(input,{target:{value:query}});
  expect(input).toHaveValue(query);
  expect(screen.getByRole('option',{name:/Índio Da Máquina/})).toBeInTheDocument();
  expect(screen.queryByRole('option',{name:/Maria/})).not.toBeInTheDocument();
 }
 fireEvent.change(input,{target:{value:'desconhecido'}});
 expect(screen.getByText('Nenhum cliente encontrado.')).toBeInTheDocument();
 fireEvent.change(input,{target:{value:'Oficina'}});
 fireEvent.keyDown(input,{key:'ArrowDown'});
 fireEvent.keyDown(input,{key:'Enter'});
 expect(input).toHaveValue('Índio Da Máquina · Oficina · #54');
 expect(input).toHaveAttribute('aria-expanded','false');
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:"10,00"}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/contas',expect.objectContaining({codigoCliente:54,valor:10})));
});
it('requires selecting a result again after changing the customer search',async()=>{
 const input=await open();
 fireEvent.change(input,{target:{value:'54'}});
 fireEvent.click(screen.getByRole('option',{name:/Índio Da Máquina/}));
 fireEvent.change(input,{target:{value:'Maria'}});
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:"10,00"}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar lançamento'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Selecione um cliente');
 expect(mock.post).not.toHaveBeenCalled();
});
it('retains the existing inactive customer when editing, while excluding others on creation',async()=>{
 const input=await open({codigoConta:1,codigoCliente:90,clienteNome:'Inativo',tipo:'debito',valor:10});
 fireEvent.focus(input);
 expect(input).toHaveValue('Inativo · #90');
 expect(screen.getByRole('option',{name:/Inativo/})).toHaveTextContent('(inativo)');
});
