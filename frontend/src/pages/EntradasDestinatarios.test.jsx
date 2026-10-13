import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,within} from '@testing-library/react';
import EntradasDestinatarios from './EntradasDestinatarios';
vi.mock('../services/api',()=>({default:{get:vi.fn().mockResolvedValue({data:{recipients:[{nome:'Filial A',documento:'19131243000197'},{nome:'Filial B',documento:'41817328000109'}],invoices:[{id:'a',numero:'1',serie:'1',emitente_nome:'Fornecedor',destinatario_nome:'Fiscal A',destinatario_documento:'19131243000197',total:10,emitida_em:'2026-01-01T12:00:00Z',data_entrada:'2026-01-02T12:00:00Z'},{id:'b',numero:'2',serie:'1',emitente_nome:'Fornecedor',destinatario_nome:'Fiscal B',destinatario_documento:'41817328000109',total:20,emitida_em:'2026-01-01T12:00:00Z',data_entrada:'2026-01-03T12:00:00Z'}]}})}}));
it('separates totals by recipient and filters by receiving date',async()=>{
 render(<EntradasDestinatarios/>);await screen.findByText('Fiscal A');
 fireEvent.change(screen.getByLabelText('Destinatário'),{target:{value:'19131243000197'}});
 expect(screen.queryByText('Fiscal B')).not.toBeInTheDocument();expect(screen.getByText('R$ 10,00',{selector:'strong'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Entrada de'),{target:{value:'2026-01-03'}});expect(screen.getByText('Nenhuma entrada encontrada.')).toBeInTheDocument();
});
