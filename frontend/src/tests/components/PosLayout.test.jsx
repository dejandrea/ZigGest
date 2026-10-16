import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import AppLayout from '../../components/AppLayout';
vi.mock('../../auth/AuthContext',()=>({useAuth:()=>({profile:{nome:'Operador',role:'ADMIN'},isAdmin:true,signOut:vi.fn()})}));
vi.mock('../../components/SystemNotifications',()=>({default:()=> <button>Notificações globais</button>}));
it.each(['/pdv','/comandas'])('keeps global notifications and hides the navigation on %s',path=>{
 render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<AppLayout/>}><Route path={path} element={<p>Atendimento</p>}/></Route></Routes></MemoryRouter>);
 expect(screen.queryByRole('complementary',{name:'Menu principal'})).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Notificações globais'})).toBeInTheDocument();
 expect(screen.getByText('Atendimento')).toBeInTheDocument();
});
