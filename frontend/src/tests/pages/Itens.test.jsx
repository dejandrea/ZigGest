import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import Itens from '../../pages/Itens';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
it('shows one entry for a combined item and filters the three uses',async()=>{
 mock.get.mockResolvedValue({data:[{key:'p:cola',nome:'COCA',produto:true,insumo:true,ativo:true,unidade:'UN',saldo:24,precoVenda:6},{key:'p:pack',nome:'PACK',produto:true,insumo:false,ativo:true,precoVenda:60},{key:'s:flour',nome:'FARINHA',produto:false,insumo:true,ativo:true,unidade:'KG',saldo:10}]});
 render(<Itens/>);await screen.findByText('COCA');
 expect(screen.getByText('24 UN')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar uso do item'),{target:{value:'BOTH'}});
 expect(screen.getByText('COCA')).toBeInTheDocument();expect(screen.queryByText('PACK')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar uso do item'),{target:{value:'STOCK'}});
 expect(screen.getByText('FARINHA')).toBeInTheDocument();expect(screen.queryByText('COCA')).not.toBeInTheDocument();
});
