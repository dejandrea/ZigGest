import React from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Producao from '../../pages/Producao';
vi.mock('../../auth/AuthContext',()=>({useAuth:()=>({isAdmin:true})}));
vi.mock('../../services/api',()=>({default:{get:vi.fn(path=>Promise.resolve({data:path==='/producao'?{recipes:[{id:'r',nome:'MASSA',numero:1,revision:0,ativo:true,inputs:[],outputs:[]}],batches:[{id:'b',numero:1,recipe_id:'r',recipe_nome:'MASSA',recipe_revision:0,location_id:'main',multiplier:1,status:'CONFIRMED',inputs:[],outputs:[{product_id:'cup',nome:'CUPCAKE',unidade:'UN',quantidade:24,previsto:20}],extra_cost:5,total_cost:35,ocorrido_em:'2026-10-11T12:00:00Z',created_at:'2026-10-11T12:00:00Z'},{id:'undo',numero:2,recipe_id:'r',recipe_nome:'MASSA',recipe_revision:0,status:'REVERSED',inputs:[],outputs:[],extra_cost:0,total_cost:100,ocorrido_em:'2026-10-10T12:00:00Z',created_at:'2026-10-10T12:00:00Z'}]}:path==='/estoques'?{locations:[{id:'main',nome:'Principal'}]}:[]}))}}));
it('reports expected versus actual yield and excludes reversed batches from cost totals',async()=>{
 render(<MemoryRouter><Producao report/></MemoryRouter>);await screen.findByText('CUPCAKE');
 expect(screen.getByText('R$ 35,00',{selector:'strong'})).toBeInTheDocument();expect(screen.getByText('24',{selector:'td'})).toBeInTheDocument();expect(screen.getByText('4',{selector:'td'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Situação da produção'),{target:{value:'ALL'}});expect(screen.getByText('Estornada')).toBeInTheDocument();expect(screen.getByText('R$ 35,00',{selector:'strong'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Produção de'),{target:{value:'2026-10-12'}});expect(screen.getByText('Nenhuma produção encontrada.')).toBeInTheDocument();
});
