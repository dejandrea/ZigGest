import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Comandas from './Comandas';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
it('opens an identified guest comanda while cash is open',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'s',status:'OPEN',method_ids:['pix']}]:path==='/financeiro'?{methods:[]}:[]}));mock.post.mockResolvedValue({data:{}});
 render(<MemoryRouter><Comandas/></MemoryRouter>);await waitFor(()=>expect(screen.getByRole('button',{name:'+ Nova comanda'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'+ Nova comanda'}));
 fireEvent.change(screen.getByLabelText('Identificação da comanda'),{target:{value:'João balcão'}});fireEvent.click(screen.getByRole('button',{name:'Abrir comanda'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'OPEN',data:{identificacao:'João balcão',customer_codigo:null}})));
});
it('separates PDV drafts from comandas and opens the new sale immediately',async()=>{
 const row={id:'pdv',codigo_mesa:1,origem:'PDV',nome_cliente:'Venda avulsa',status:'aberta',total_geral:0,paid_total:0,itens:[],pagamentos:[]};
 let created=false;
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'s',status:'OPEN'}]:path==='/financeiro'?{methods:[]}:path==='/comandas'?[{...row,id:'comanda',origem:'COMANDA',nome_cliente:'Cliente em comanda'},...(created?[row]:[])]:[]}));
 mock.post.mockImplementation(()=>{created=true;return Promise.resolve({data:row});});
 render(<MemoryRouter><Comandas pdv/></MemoryRouter>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'+ Nova venda'})).toBeEnabled());expect(screen.queryByText('Cliente em comanda')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'+ Nova venda'}));
 await screen.findByRole('heading',{name:'Venda PDV #1'});expect(screen.getByRole('button',{name:'Finalizar venda'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Iniciar venda'})).not.toBeInTheDocument();
 expect(screen.getByLabelText('Cliente')).toHaveValue('');
 expect(screen.getByRole('button',{name:'+ Novo cliente'})).toBeInTheDocument();
 expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'OPEN_PDV',data:{identificacao:'Venda avulsa',customer_codigo:null}}));
});
