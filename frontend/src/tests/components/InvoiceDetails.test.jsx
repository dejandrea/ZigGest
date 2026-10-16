import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import InvoiceDetails from '../../components/InvoiceDetails';
import {nfeXml,makeKey} from '../testFixtures/nfe';
const api=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:api}));
beforeEach(()=>vi.clearAllMocks());
it('shows persisted original and received quantities and downloads the complete XML',async()=>{
 api.get.mockResolvedValue({data:{numero:'1',serie:'1',chave:makeKey(),emitente_nome:'Fornecedor',emitente_documento:'12345678000195',destinatario_nome:'Cliente',emitida_em:'2026-01-01T13:30:00Z',total:96,xml_original:nfeXml(),itens:[{id:'i1',n_item:1,descricao:'Coca-Cola pacote',quantidade_nf:2,unidade_nf:'PCT',valor_total:96,insumo_nome:'Coca lata',quantidade_recebida:1,fator:12,quantidade_estoque:12,unidade_estoque:'UN'}]}});
 render(<InvoiceDetails id="invoice-id" onClose={vi.fn()}/>);
 await screen.findByText('NF-e 1 / Série 1');
 expect(api.get).toHaveBeenCalledWith('/entradas-nfe/invoice-id');
 expect(screen.getByText(/Insumo: Coca lata/)).toHaveTextContent('Recebido: 1 × 12 = 12 UN');
 const create=vi.fn(()=> 'blob:invoice'),revoke=vi.fn(),click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 vi.stubGlobal('URL',Object.assign(class extends URL {},{createObjectURL:create,revokeObjectURL:revoke}));
 try{
  fireEvent.click(screen.getByRole('button',{name:'Baixar XML da NF-e'}));
  expect(create).toHaveBeenCalledWith(expect.any(Blob));
  expect(click).toHaveBeenCalled();
  expect(click.mock.instances[0].download).toBe('NFe-'+makeKey()+'.xml');
 }finally{click.mockRestore();vi.unstubAllGlobals();}
});
it('identifies a typed invoice without offering a nonexistent XML download',async()=>{
 api.get.mockResolvedValue({data:{numero:'123',serie:'1',origem:'MANUAL',emitente_nome:'Fornecedor',emitente_documento:'12345678000195',emitida_em:'2026-01-01T13:30:00Z',total:96,chave:null,xml_original:null,itens:[]}});
 render(<InvoiceDetails id="manual-note" onClose={vi.fn()}/>);
 await screen.findByText('Origem: Digitada manualmente');
 expect(screen.getByText('Chave: Não informada')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Baixar XML da NF-e'})).not.toBeInTheDocument();
});
