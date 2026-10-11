import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import StockNotifications from './StockNotifications';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const alert={id:'alert',stock_item_id:'cola',nome:'Coca',unidade:'UN',saldo:2,minimo:5};
beforeEach(()=>{mock.get.mockReset();mock.get.mockResolvedValue({data:[alert]});});
function Path(){const {pathname,search}=useLocation();return <p>{pathname+search}</p>;}
it('shows the active count and links a stock warning to purchases',async()=>{
 render(<MemoryRouter><StockNotifications/><Path/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Notificações de estoque: 1'}));
 expect(screen.getByText('Coca')).toBeInTheDocument();expect(screen.getByText(/saldo 2 UN/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Ver na lista de compras'}));expect(screen.getByText('/compras?insumo=cola')).toBeInTheDocument();
});
it('does not claim zero alerts on a failed fetch and allows retry',async()=>{
 mock.get.mockRejectedValue(new Error('Offline'));render(<MemoryRouter><StockNotifications/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Notificações de estoque indisponíveis'}));await screen.findByRole('alert');
 mock.get.mockResolvedValue({data:[]});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Notificações de estoque: 0'})).toBeInTheDocument());
});
