import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import App from './App';
vi.mock('./auth/AuthContext',()=>({useAuth:()=>({session:null,profile:null,loading:false,recovery:false})}));
it('requires authentication',()=>{render(<MemoryRouter initialEntries={['/clientes']}><App/></MemoryRouter>);expect(screen.getByRole('heading',{name:'Entrar'})).toBeInTheDocument();});
