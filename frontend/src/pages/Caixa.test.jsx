import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import Caixa from './Caixa';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),admin:true}));
vi.mock('../services/api',()=>({default:mock}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({isAdmin:mock.admin})}));
beforeEach(()=>{vi.clearAllMocks();mock.admin=true;mock.post.mockResolvedValue({data:{}});});
const finance={accounts:[{id:'cash',nome:'Caixa físico',tipo:'CASH',saldo:100,ativo:true},{id:'bank',nome:'Banco',tipo:'BANK',saldo:100,ativo:true}],categories:[{id:'sales',nome:'Vendas',natureza:'INCOME',ativo:true}],methods:[{id:'pix',nome:'Pix',tipo:'PIX',ativo:true,usar_pdv:false}],operations:[]};
it('keeps cash closing disabled while comandas are open',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'session',status:'OPEN',conta_id:'cash',method_ids:['pix'],opened_at:'2026-10-11T03:00:00Z'}]:path==='/comandas'?[{id:'c1',status:'aberta',pagamentos:[]}]:finance}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);await screen.findByRole('button',{name:'Fechar caixa'});expect(screen.getByRole('button',{name:'Fechar caixa'})).toBeDisabled();expect(mock.post).not.toHaveBeenCalled();
});
it('opens cash with a starting amount and enables all methods automatically',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/financeiro'?finance:[]}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);await screen.findByLabelText('Conta financeira do caixa');
 fireEvent.change(screen.getByLabelText('Conta financeira do caixa'),{target:{value:'cash'}});fireEvent.change(screen.getByLabelText('Categoria das receitas'),{target:{value:'sales'}});fireEvent.change(screen.getByLabelText('Valor de abertura'),{target:{value:'50'}});fireEvent.click(screen.getByRole('button',{name:'Abrir caixa'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa',expect.objectContaining({action:'OPEN',data:{conta_id:'cash',categoria_id:'sales',valor_abertura:50,origem_id:null}})));
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
});
const sale={id:'sale',number:1,status:'FINALIZED',total:50,nome_cliente:'Cliente',nota_fiscal:false,finalized_at:'2026-10-11T03:00:00Z'};
const cashSession={id:'session',status:'OPEN',conta_id:'cash',opening_amount:100,expected_cash:100,sales:[sale],movements:[],opened_at:'2026-10-11T03:00:00Z'};
function setup(){mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[cashSession]:path==='/comandas'?[]:finance}));render(<MemoryRouter><Caixa/></MemoryRouter>);}
it('confirms cash counting with the expected value and a discrepancy reason',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'Fechar caixa'}));
 fireEvent.change(screen.getByLabelText('Dinheiro contado'),{target:{value:'99'}});fireEvent.change(screen.getByLabelText('Justificativa da diferença'),{target:{value:'Falta um real'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirmar fechamento'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa',{id:'session',action:'CLOSE',data:{contado:99,esperado:100,motivo:'Falta um real'}}));
});
it('registers withdrawal as a transfer with a mandatory reason',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'Sangria'}));
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:'25'}});fireEvent.change(screen.getByLabelText('Conta de destino'),{target:{value:'bank'}});fireEvent.change(screen.getByLabelText('Motivo'),{target:{value:'Guardar dinheiro'}});
 fireEvent.click(screen.getByRole('button',{name:'Confirmar sangria'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa',expect.objectContaining({action:'WITHDRAW',data:expect.objectContaining({valor:25,conta_id:'bank',motivo:'Guardar dinheiro'})})));
});
it('reopens a sale and alerts the new comanda number with a direct link',async()=>{
 mock.post.mockResolvedValue({data:{number:1,comanda_numero:1,comanda_id_aberta:'reopened'}});
 setup();fireEvent.click(await screen.findByRole('button',{name:'Reabrir venda #1'}));
 fireEvent.change(screen.getByLabelText('Motivo'),{target:{value:'Corrigir consumo'}});fireEvent.click(screen.getByRole('button',{name:'Confirmar reabertura'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('comanda #1');expect(screen.getByRole('link',{name:'Abrir comanda'})).toHaveAttribute('href','/comandas?comanda=reopened');
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa-vendas',expect.objectContaining({id:'sale',action:'REOPEN'})));
});
it('has an unchecked invoice flag and persists changes',async()=>{
 setup();const checkbox=await screen.findByRole('checkbox',{name:'Nota fiscal gerada da venda 1'});expect(checkbox).not.toBeChecked();fireEvent.click(checkbox);
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/caixa-vendas',expect.objectContaining({id:'sale',action:'INVOICE',data:expect.objectContaining({nota_fiscal:true})})));
});
it('hides cancellation and reopening from operators',async()=>{
 mock.admin=false;setup();await screen.findByRole('checkbox',{name:'Nota fiscal gerada da venda 1'});
 expect(screen.queryByRole('button',{name:'Reabrir venda #1'})).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Cancelar venda #1'})).not.toBeInTheDocument();
});
it('includes payments from comandas that are still open in cash totals',async()=>{
 mock.get.mockImplementation(path=>Promise.resolve({data:path==='/caixa'?[{id:'session',status:'OPEN',conta_id:'cash',method_ids:['pix'],opened_at:'2026-10-11T03:00:00Z'}]:path==='/comandas'?[{id:'c1',status:'aberta',pagamentos:[{id:'p1',cash_session_id:'session',forma_id:'pix',valor:30,operation_id:'income'}]}]:finance}));
 render(<MemoryRouter><Caixa/></MemoryRouter>);
 await screen.findByRole('button',{name:'Fechar caixa'});
 expect(screen.getByRole('cell',{name:/30,00/})).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Fechar caixa'})).toBeDisabled();
});
