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
