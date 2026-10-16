import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import RelatorioEstoque from '../../pages/RelatorioEstoque';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
it('keeps optional minimum separate from negative balances and offers no write actions',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[],balances:[]}: [{_id:'1',codigoInsumo:1,nome:'Coca',unidade:'UN',saldo:-2,estoqueMinimo:null,ativo:true},{_id:'2',codigoInsumo:2,nome:'Água',unidade:'UN',saldo:1,estoqueMinimo:2,ativo:true}]}));
 render(<RelatorioEstoque/>);await screen.findByText('Coca');
 fireEvent.change(screen.getByLabelText('Filtrar relatório de estoque'),{target:{value:'low'}});
 expect(screen.queryByText('Coca')).not.toBeInTheDocument();expect(screen.getByText('Água')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar relatório de estoque'),{target:{value:'negative'}});
 expect(screen.getByText('Coca')).toBeInTheDocument();expect(screen.queryByText('Água')).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Editar'})).not.toBeInTheDocument();
});
it('finds negative sector balances even when the consolidated balance is positive',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[{id:'kitchen',nome:'Cozinha',ativo:true}],balances:[{stock_item_id:'1',location_id:'kitchen',saldo:-2}]}:[{_id:'1',codigoInsumo:1,nome:'Coca',unidade:'UN',saldo:10,estoqueMinimo:null,ativo:true}]}));
 render(<RelatorioEstoque/>);await screen.findByText('Coca');
 fireEvent.change(screen.getByLabelText('Filtrar relatório de estoque'),{target:{value:'negative'}});expect(screen.queryByText('Coca')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Estoque / setor'),{target:{value:'kitchen'}});expect(screen.getByText('Coca')).toBeInTheDocument();expect(screen.getByText('-2')).toBeInTheDocument();
});
