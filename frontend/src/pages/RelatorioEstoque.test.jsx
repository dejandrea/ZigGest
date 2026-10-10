import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import RelatorioEstoque from './RelatorioEstoque';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
it('keeps optional minimum separate from negative balances and offers no write actions',async()=>{
 mock.get.mockResolvedValue({data:[{_id:'1',codigoInsumo:1,nome:'Coca',unidade:'UN',saldo:-2,estoqueMinimo:null,ativo:true},{_id:'2',codigoInsumo:2,nome:'Água',unidade:'UN',saldo:1,estoqueMinimo:2,ativo:true}]});
 render(<RelatorioEstoque/>);await screen.findByText('Coca');
 fireEvent.change(screen.getByLabelText('Filtrar relatório de estoque'),{target:{value:'low'}});
 expect(screen.queryByText('Coca')).not.toBeInTheDocument();expect(screen.getByText('Água')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar relatório de estoque'),{target:{value:'negative'}});
 expect(screen.getByText('Coca')).toBeInTheDocument();expect(screen.queryByText('Água')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Editar'})).not.toBeInTheDocument();
});
