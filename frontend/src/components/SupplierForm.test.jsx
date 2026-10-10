import React from 'react';
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import SupplierForm from './SupplierForm';
const mock=vi.hoisted(()=>({lookup:vi.fn(),post:vi.fn()}));
vi.mock('../services/supplierLookup',async importOriginal=>({...await importOriginal(),lookupSupplier:mock.lookup}));
vi.mock('../services/api',()=>({default:{post:mock.post}}));
beforeEach(()=>{vi.clearAllMocks();mock.post.mockResolvedValue({data:{}});});
it('automatically fills blank fields on leaving CNPJ, preserving existing invoice or manual data',async()=>{
 let resolve;mock.lookup.mockImplementation(()=>new Promise(r=>resolve=r));
 render(<SupplierForm initialValues={{nome:'Nome da NF-e'}} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'19.131.243/0001-97'}});
 fireEvent.blur(screen.getByLabelText('CPF / CNPJ'));
 fireEvent.change(screen.getByLabelText('Telefone'),{target:{value:'7133331111'}});
 resolve({nome:'Nome consultado',nomeFantasia:'Marca',telefone:'1199999999',endereco:'Endereço consultado'});
 await waitFor(()=>expect(screen.getByLabelText('Nome fantasia')).toHaveValue('Marca'));
 expect(screen.getByLabelText('Nome / razão social')).toHaveValue('Nome da NF-e');
 expect(screen.getByLabelText('Telefone')).toHaveValue('7133331111');
});
it('allows saving manually after an unsuccessful lookup',async()=>{
 mock.lookup.mockRejectedValue(new Error('Não foi possível consultar. Preencha manualmente.'));
 render(<SupplierForm onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'19131243000197'}});
 fireEvent.blur(screen.getByLabelText('CPF / CNPJ'));
 await screen.findByText('Não foi possível consultar. Preencha manualmente.');
 fireEvent.change(screen.getByLabelText('Nome / razão social'),{target:{value:'Fornecedor manual'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar fornecedor'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/fornecedores',expect.objectContaining({nome:'Fornecedor manual'})));
});
it('ignores old responses when the document changes during lookup',async()=>{
 let resolve;mock.lookup.mockImplementation(()=>new Promise(r=>resolve=r));
 render(<SupplierForm onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'19131243000197'}});
 fireEvent.blur(screen.getByLabelText('CPF / CNPJ'));
 fireEvent.change(screen.getByLabelText('CPF / CNPJ'),{target:{value:'12345678000195'}});
 resolve({nome:'Empresa anterior'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Consultar CNPJ'})).toBeEnabled());
 expect(screen.getByLabelText('Nome / razão social')).toHaveValue('');
});
