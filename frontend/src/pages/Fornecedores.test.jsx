import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Fornecedores from './Fornecedores';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const rows=[{codigoFornecedor:1,nome:'Alpha',nomeFantasia:'Parceiro',ativo:true,documento:'AB123'},{codigoFornecedor:2,nome:'Beta',ativo:false}];
it('formats existing documents and phones and searches either formatted or plain documents',async()=>{
 api.get.mockResolvedValue({data:[{codigoFornecedor:27,nome:'NORSA',documento:'07196033002303',telefone:'7133334444',ativo:true}]});
 render(<Fornecedores/>);
 expect(await screen.findByText('07.196.033/0023-03')).toBeInTheDocument();
 expect(screen.getByText('(71) 3333-4444')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Buscar fornecedores'),{target:{value:'07.196.033/0023-03'}});
 expect(screen.getByText('NORSA')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Buscar fornecedores'),{target:{value:'07196033002303'}});
 expect(screen.getByText('NORSA')).toBeInTheDocument();
});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:rows});api.post.mockResolvedValue({data:{}});api.put.mockResolvedValue({data:{}});});
it('ordena os recentes primeiro e busca por documento ou filtra inativos',async()=>{
 render(<Fornecedores/>);await screen.findByRole('button',{name:'Editar fornecedor Beta'});
 expect(screen.getAllByRole('row')[1]).toHaveTextContent('Beta');
 fireEvent.change(screen.getByLabelText('Buscar fornecedores'),{target:{value:'AB123'}});
 expect(screen.queryByRole('button',{name:'Editar fornecedor Beta'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByText('Limpar filtros'));
 fireEvent.change(screen.getByLabelText('Filtrar fornecedores'),{target:{value:'inactive'}});
 expect(screen.queryByRole('button',{name:'Editar fornecedor Alpha'})).not.toBeInTheDocument();
});
it('preserva os dados quando o cadastro falha e permite tentar novamente',async()=>{
 api.post.mockRejectedValueOnce(new Error('Documento duplicado'));
 render(<Fornecedores/>);await screen.findByText('Alpha');
 fireEvent.click(screen.getByRole('button',{name:/Novo fornecedor/}));
 fireEvent.change(screen.getByLabelText('Nome / razão social'),{target:{value:'Novo parceiro'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar fornecedor'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Documento duplicado');
 expect(screen.getByLabelText('Nome / razão social')).toHaveValue('Novo parceiro');
 fireEvent.click(screen.getByRole('button',{name:'Salvar fornecedor'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 expect(api.post).toHaveBeenCalledWith('/fornecedores',expect.objectContaining({nome:'Novo parceiro',ativo:true}));
});
it('edita e desativa sem excluir o cadastro',async()=>{
 render(<Fornecedores/>);await screen.findByText('Alpha');
 fireEvent.click(screen.getByRole('button',{name:'Editar fornecedor Alpha'}));
 fireEvent.change(screen.getByLabelText('Situação'),{target:{value:'false'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar fornecedor'}));
 await waitFor(()=>expect(api.put).toHaveBeenCalledWith('/fornecedores/1',expect.objectContaining({ativo:false})));
});
it('distingue erro de consulta de lista vazia',async()=>{
 api.get.mockRejectedValue(new Error('Offline'));render(<Fornecedores/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
 expect(screen.queryByText(/Nenhum fornecedor cadastrado/)).not.toBeInTheDocument();
});
