import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import SystemNotifications from '../../components/SystemNotifications';
const mock=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../services/api',()=>({default:mock}));
const alert={id:'stock:cola',kind:'LOW_STOCK',category:'Estoque',severity:'WARNING',details:{stockItemId:'cola',name:'Coca',unit:'UN',balance:'2',minimum:'5'}};
beforeEach(()=>{mock.get.mockReset();mock.get.mockResolvedValue({data:[alert]});});
function Path(){const {pathname,search}=useLocation();return <p>{pathname+search}</p>;}
it('combines every module in the bell, filters categories and opens the matching screen',async()=>{
 const alerts=[alert,
  {id:'cash:1',kind:'CASH_OPEN_24H',category:'Caixa',severity:'URGENT',details:{openedAt:'2026-10-10T12:00:00Z'}},
  {id:'payable:1',kind:'PAYABLE_OVERDUE',category:'Contas a pagar',severity:'URGENT',details:{supplier:'Fornecedor A',description:'Nota 10',reference:'1',dueDate:'2026-10-10',balance:'0.123456'}},
  {id:'payable:2',kind:'PAYABLE_DUE_SOON',category:'Contas a pagar',severity:'WARNING',details:{supplier:'Fornecedor B',description:'Nota 11',reference:'2',dueDate:'2026-10-15',balance:'20'}},
  {id:'receivable:1',kind:'RECEIVABLE_OVERDUE',category:'Contas a receber',severity:'URGENT',details:{customer:'Joana',entryCode:12,dueDate:'2026-10-10',balance:'10'}},
  {id:'customer-limit:1',kind:'CUSTOMER_OVER_LIMIT',category:'Clientes',severity:'URGENT',details:{customer:'Maria',balance:'150',limit:'100',excess:'50'}}];
 mock.get.mockResolvedValue({data:alerts});
 render(<MemoryRouter><SystemNotifications/><Path/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Notificações: 6'}));
 expect(screen.getByRole('heading',{name:'Notificações do sistema'})).toBeInTheDocument();
 expect(screen.getByText('Caixa aberto há mais de 24 horas')).toBeInTheDocument();
 expect(screen.getByText('Conta a pagar vencida: Fornecedor A')).toBeInTheDocument();
 expect(screen.getByText('Conta a pagar próxima do vencimento: Fornecedor B')).toBeInTheDocument();
 expect(screen.getByText('Conta a receber vencida: Joana')).toBeInTheDocument();
 expect(screen.getByText(/R\$\s*0,123456/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Clientes (1)'}));
 expect(screen.queryByText('Coca')).not.toBeInTheDocument();
 expect(screen.getByText('Limite ultrapassado: Maria')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Ver clientes'}));
 expect(screen.getByText('/clientes')).toBeInTheDocument();
 expect(mock.get).toHaveBeenCalledWith('/notificacoes');
});
it('shows the active count and links a stock warning to purchases',async()=>{
 render(<MemoryRouter><SystemNotifications/><Path/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Notificações: 1'}));
 expect(screen.getByText('Coca')).toBeInTheDocument();expect(screen.getByText(/saldo 2 UN/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Ver na lista de compras'}));expect(screen.getByText('/compras?insumo=cola')).toBeInTheDocument();
});
it('does not claim zero alerts on a failed fetch and allows retry',async()=>{
 mock.get.mockRejectedValue(new Error('Offline'));render(<MemoryRouter><SystemNotifications/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Notificações indisponíveis'}));await screen.findByRole('alert');
 mock.get.mockResolvedValue({data:[]});fireEvent.click(screen.getByRole('button',{name:'Tentar novamente'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Notificações: 0'})).toBeInTheDocument());
});
