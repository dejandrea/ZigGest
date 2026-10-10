import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import InvoiceEntryForm from './InvoiceEntryForm';
import {nfeXml,makeKey} from '../testFixtures/nfe';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const item={_id:'11111111-1111-1111-1111-111111111111',nome:'Coca lata',unidade:'UN',ativo:true};
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{}});});
async function upload(xml=nfeXml()){
 const file=new File([xml],'nfe.xml',{type:'application/xml'}),bytes=new TextEncoder().encode(xml);
 file.arrayBuffer=async()=>bytes.buffer;
 fireEvent.change(screen.getByLabelText('Arquivo XML da NF-e'),{target:{files:[file]}});
 await screen.findByText('NF-e 1 / Série 1');
}
it('links an invoice product and converts two packages into 24 units with a safe retry',async()=>{
 api.post.mockRejectedValueOnce(new Error('Resposta perdida'));
 const success=vi.fn();render(<InvoiceEntryForm items={[item]} onClose={vi.fn()} onSuccess={success}/>);
 await upload();
 fireEvent.change(screen.getByLabelText('Insumo do item 1'),{target:{value:item._id}});
 fireEvent.change(screen.getByLabelText('Unidades por embalagem do item 1'),{target:{value:'12'}});
 expect(screen.getByText('Entrada do item 1: 24 UN')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Registrar entrada da NF-e'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Resposta perdida');
 fireEvent.click(screen.getByRole('button',{name:'Registrar entrada da NF-e'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[0][1]).toMatchObject({xml:nfeXml(),lines:[{line:1,stockItemId:item._id,quantity:'2',factor:'12'}]});
 expect(api.post.mock.calls[0][1].requestId).toBe(api.post.mock.calls[1][1].requestId);
 expect(success).toHaveBeenCalled();
});
it('keeps invoice quantity separate from adjusted received quantity',async()=>{
 render(<InvoiceEntryForm items={[item]} onClose={vi.fn()} onSuccess={vi.fn()}/>);await upload();
 fireEvent.change(screen.getByLabelText('Insumo do item 1'),{target:{value:item._id}});
 fireEvent.change(screen.getByLabelText('Quantidade recebida do item 1'),{target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('Unidades por embalagem do item 1'),{target:{value:'12'}});
 expect(screen.getByText('Entrada do item 1: 12 UN')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Registrar entrada da NF-e'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/entradas-nfe',expect.objectContaining({xml:nfeXml(),lines:[expect.objectContaining({quantity:'1'})]})));
});
it('offers the official portal and rejects XML for a different typed key',async()=>{
 render(<InvoiceEntryForm items={[item]} onClose={vi.fn()} onSuccess={vi.fn()}/>);
 expect(screen.getByRole('link',{name:'Abrir portal oficial'})).toHaveAttribute('href','https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx');
 fireEvent.change(screen.getByLabelText('Chave de acesso (44 dígitos)'),{target:{value:makeKey(2)}});
 const bytes=new TextEncoder().encode(nfeXml()),file=new File([nfeXml()],'nfe.xml');file.arrayBuffer=async()=>bytes.buffer;
 fireEvent.change(screen.getByLabelText('Arquivo XML da NF-e'),{target:{files:[file]}});
 expect(await screen.findByRole('alert')).toHaveTextContent('outra chave');
 expect(api.post).not.toHaveBeenCalled();
});
