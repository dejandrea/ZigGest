import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ComandaTransferForm from './ComandaTransferForm';
const mock=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const comanda={id:'source',codigo_mesa:1,origem:'PDV',cash_session_id:'session',nome_cliente:'Balcão',total_geral:50,paid_total:10,itens:[{id:'coca',descricao:'Coca',quantidade:5,quantidade_paga:1,valor_unitario:10}]};
const destination={id:'dest',codigo_mesa:2,origem:'COMANDA',cash_session_id:'session',nome_cliente:'João',status:'aberta',total_geral:20,paid_total:0};
const props={comanda,comandas:[comanda,destination,{...destination,id:'other',cash_session_id:'old',nome_cliente:'Outro caixa'}],customers:[],onClose:vi.fn(),onSuccess:vi.fn()};
beforeEach(()=>{vi.clearAllMocks();mock.post.mockResolvedValue({data:{comanda_id:'dest',comanda_numero:2}});});
it('reviews an item transfer and excludes targets from another cash session',async()=>{
 render(<ComandaTransferForm {...props}/>);
 expect(screen.queryByRole('option',{name:/Outro caixa/})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'dest'}});
 fireEvent.change(screen.getByLabelText('Quantidade a transferir de Coca'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar transferência'}));
 await screen.findByRole('button',{name:'Confirmar transferência'});expect(mock.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({id:'source',action:'TRANSFER',data:expect.objectContaining({total:50,paid_total:10,destination_id:'dest',destination_total:20,destination_paid_total:0,items:[{item_id:'coca',quantidade:2}]})})));
 expect(props.onSuccess).toHaveBeenCalledWith({comanda_id:'dest',comanda_numero:2});
});
it('converts the entire PDV while preserving receipts instead of transferring paid items',async()=>{
 render(<ComandaTransferForm {...props}/>);fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'convert'}});
 expect(screen.queryByLabelText('Quantidade a transferir de Coca')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Revisar transferência'}));await screen.findByRole('button',{name:'Confirmar transferência'});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'CONVERT',data:expect.objectContaining({total:50,paid_total:10,identificacao:'Balcão'})})));
});
it('blocks transfers exceeding a balance reduced by value payments',async()=>{
 render(<ComandaTransferForm {...props} comanda={{...comanda,paid_total:35}}/>);
 fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'dest'}});fireEvent.change(screen.getByLabelText('Quantidade a transferir de Coca'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Revisar transferência'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('ultrapassam o saldo');expect(mock.post).not.toHaveBeenCalled();
});
it('opens a new identified comanda to receive selected items between comandas',async()=>{
 render(<ComandaTransferForm {...props} comanda={{...comanda,origem:'COMANDA'}}/>);
 expect(screen.queryByRole('option',{name:'Abrir comanda com todo este atendimento'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Destino'),{target:{value:'new'}});fireEvent.change(screen.getByLabelText('Identificação da nova comanda'),{target:{value:'Maria'}});fireEvent.change(screen.getByLabelText('Quantidade a transferir de Coca'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar transferência'}));await screen.findByRole('button',{name:'Confirmar transferência'});fireEvent.click(screen.getByRole('button',{name:'Confirmar transferência'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'TRANSFER',data:expect.objectContaining({new_destination:true,identificacao:'Maria',items:[{item_id:'coca',quantidade:1}]})})));
});
