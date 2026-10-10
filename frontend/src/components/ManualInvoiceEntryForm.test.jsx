import React from 'react';
import {it,expect,vi,beforeEach} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import InvoiceEntryForm from './InvoiceEntryForm';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{}});});
it('enters a note without XML or access key and converts two packages to 24 units',async()=>{
 const success=vi.fn(),item={_id:'11111111-1111-1111-1111-111111111111',nome:'Coca lata',unidade:'UN',ativo:true};
 render(<InvoiceEntryForm items={[item]} onClose={vi.fn()} onSuccess={success}/>);
 fireEvent.change(screen.getByLabelText('Forma de entrada'),{target:{value:'manual'}});
 expect(screen.queryByLabelText('Arquivo XML da NF-e')).not.toBeInTheDocument();
 for(const [label,value] of [['Número da nota','123'],['Série','1'],['Nome / razão social do fornecedor','Fornecedor'],['CPF / CNPJ do fornecedor','12345678000195'],['Data de emissão','2026-01-01T10:00'],['Valor total da nota','96'],['Descrição do item 1','Coca pacote'],['Unidade na nota do item 1','PCT'],['Quantidade na nota do item 1','2'],['Valor unitário do item 1','48'],['Valor total do item 1','96'],['Quantidade recebida do item 1','2'],['Unidades por embalagem do item 1','12'],['Insumo do item 1',item._id]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
 expect(screen.getByText('Entrada do item 1: 24 UN')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Registrar nota manual'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/entradas-nfe-manual',expect.objectContaining({header:expect.objectContaining({number:'123'}),lines:[expect.objectContaining({quantity:'2',factor:'12',stockItemId:item._id})]})));
 expect(api.post.mock.calls[0][1]).not.toHaveProperty('xml');
 expect(success).toHaveBeenCalled();
});
it('adds and removes manual invoice lines',()=>{
 render(<InvoiceEntryForm items={[]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Forma de entrada'),{target:{value:'manual'}});
 fireEvent.click(screen.getByRole('button',{name:'Adicionar item'}));
 expect(screen.getByLabelText('Descrição do item 2')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Remover item 1'}));
 expect(screen.queryByLabelText('Descrição do item 2')).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Remover item 1'})).toBeDisabled();
});
