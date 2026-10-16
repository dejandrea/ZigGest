import React from 'react';
import {beforeEach,expect,it,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import FinancialMovements from '../../pages/FinancialMovements';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),admin:true}));
vi.mock('../../services/api',()=>({default:mock}));
vi.mock('../../auth/AuthContext',()=>({useAuth:()=>({isAdmin:mock.admin})}));
const finance={accounts:[{id:'cash',nome:'Caixa',saldo:70,ativo:true},{id:'bank',nome:'Banco',saldo:30,ativo:true}],categories:[],methods:[],operations:[{id:'t',tipo:'TRANSFER',valor:30,data:'2026-01-01',descricao:'Transferência teste',conta_id:'cash',destino_id:'bank',created_at:'2026-01-01T12:00:00Z'}],entries:[{operation_id:'t',conta_id:'cash',valor:-30},{operation_id:'t',conta_id:'bank',valor:30}]};
beforeEach(()=>{vi.clearAllMocks();mock.admin=true;mock.get.mockImplementation(path=>Promise.resolve({data:path==='/financeiro'?finance:[]}));});
it('filters a transfer by destination and preserves consolidated balance',async()=>{
 render(<MemoryRouter><FinancialMovements/></MemoryRouter>);
 await screen.findByText('Transferência teste');
 expect(screen.getByText('R$ 100,00')).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Filtrar conta financeira'),{target:{value:'bank'}});
 expect(screen.getByText('Transferência teste')).toBeInTheDocument();
 expect(screen.getByText(/Variação: R\$ 30,00/)).toBeInTheDocument();
});
it('shows reversal only for administrators and preserves the original reference',async()=>{
 render(<MemoryRouter><FinancialMovements/></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Estornar'}));
 expect(screen.getByRole('dialog',{name:'Estorno'})).toBeInTheDocument();
 expect(screen.getByLabelText('Descrição')).toHaveValue('Estorno: Transferência teste');
 expect(screen.getByLabelText('Motivo do estorno')).toBeRequired();
});
it('keeps reversal/configuration unavailable to operators',async()=>{
 mock.admin=false;render(<MemoryRouter><FinancialMovements/></MemoryRouter>);
 await screen.findByText('Transferência teste');
 expect(screen.queryByRole('button',{name:'Estornar'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Configurações financeiras'})).not.toBeInTheDocument();
});
