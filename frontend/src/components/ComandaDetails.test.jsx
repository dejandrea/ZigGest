import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ComandaDetails,{validateComandaPayments} from './ComandaDetails';
const mock=vi.hoisted(()=>({post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../services/api',()=>({default:mock}));
const methods=[{id:'pix',nome:'Pix',tipo:'PIX',ativo:true,usar_pdv:true},{id:'deferred',nome:'A prazo',tipo:'DEFERRED',ativo:true,usar_pdv:true}];
const tab={id:'c1',codigo_mesa:1,nome_cliente:'Cliente Um',customer_codigo:1,total_geral:80,status:'aberta',itens:[{id:'item',descricao:'Consumo',quantidade:8,total:80,valor_unitario:10}],pagamentos:[]};
const props={comanda:tab,customers:[{codigoCliente:1,nome:'Cliente Um',ativo:true}],finance:{methods},session:{method_ids:['pix']},onClose:vi.fn(),onSaved:vi.fn().mockResolvedValue()};
beforeEach(()=>{vi.clearAllMocks();mock.post.mockResolvedValue({data:{}});});
it('keeps a PDV in service after a partial payment and finalizes only through close',async()=>{
 render(<ComandaDetails {...props} comanda={{...tab,origem:'PDV'}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Pagar por valor'}));fireEvent.change(screen.getByLabelText('Valor a abater'),{target:{value:'30'}});fireEvent.click(screen.getByRole('button',{name:'Usar valor no pagamento'}));fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));await screen.findByRole('button',{name:'Confirmar pagamento parcial'});fireEvent.click(screen.getByRole('button',{name:'Confirmar pagamento parcial'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'PAY',data:expect.objectContaining({mode:'VALUE',payments:[{forma_id:'pix',valor:30}]})})));
 expect(props.onClose).not.toHaveBeenCalled();expect(await screen.findByRole('button',{name:'Finalizar venda'})).toBeInTheDocument();
});
it('requires a registered customer for deferred payment and validates the exact split',()=>{
 expect(()=>validateComandaPayments(80,[{forma_id:'deferred',valor:'80'}],methods,null,'2026-12-01')).toThrow('cadastrado');
 expect(()=>validateComandaPayments(80,[{forma_id:'pix',valor:'79'}],methods,1,'2026-12-01')).toThrow('soma');
 expect(validateComandaPayments(80,[{forma_id:'pix',valor:'50'},{forma_id:'deferred',valor:'30'}],methods,1,'2026-12-01')).toEqual([{forma_id:'pix',valor:50},{forma_id:'deferred',valor:30}]);
});
it('reviews a split payment before closing and sends the expected consumption total',async()=>{
 render(<ComandaDetails {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Encerrar comanda'}));
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:'50'}});fireEvent.click(screen.getByRole('button',{name:'+ Dividir pagamento'}));
 fireEvent.change(screen.getAllByLabelText('Forma de pagamento')[1],{target:{value:'deferred'}});fireEvent.change(screen.getAllByLabelText('Valor')[1],{target:{value:'30'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));await screen.findByRole('button',{name:'Confirmar encerramento'});expect(mock.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Confirmar encerramento'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({id:'c1',action:'CLOSE',data:expect.objectContaining({total:80,payments:[{forma_id:'pix',valor:50},{forma_id:'deferred',valor:30}]})})));
});
it('registers and links a new client in the comanda without discarding the consumption',async()=>{
 mock.post.mockImplementation(path=>Promise.resolve({data:path==='/clientes'?{codigoCliente:2,nome:'Avulso',ativo:true}:{}}));
 render(<ComandaDetails {...props} comanda={{...tab,nome_cliente:'Avulso',customer_codigo:null}}/>);
 fireEvent.click(screen.getByRole('button',{name:'+ Novo cliente'}));expect(screen.getByLabelText('Nome')).toHaveValue('Avulso');fireEvent.click(screen.getByRole('button',{name:'Salvar'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',{id:'c1',action:'IDENTIFY',data:{identificacao:'Avulso',customer_codigo:2}}));
 expect(screen.getByRole('cell',{name:'Consumo'})).toBeInTheDocument();
});
it('preserves the checkout when the server detects changed consumption',async()=>{
 mock.post.mockRejectedValue(new Error('O consumo mudou. Atualize a comanda e revise o pagamento.'));
 render(<ComandaDetails {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Encerrar comanda'}));fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));fireEvent.click(await screen.findByRole('button',{name:'Confirmar encerramento'}));
 await screen.findByRole('alert');expect(props.onClose).not.toHaveBeenCalled();expect(screen.getByLabelText('Valor')).toHaveValue(80);
});
it('offers all active payment methods and defaults the invoice flag to false',async()=>{
 render(<ComandaDetails {...props} finance={{methods:methods.map(m=>({...m,usar_pdv:false}))}} session={{method_ids:[]}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Encerrar comanda'}));
 expect(screen.getByRole('option',{name:'Pix'})).toBeInTheDocument();
 expect(screen.getByLabelText('Nota fiscal gerada para esta venda')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('Nota fiscal gerada para esta venda'));
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));fireEvent.click(await screen.findByRole('button',{name:'Confirmar encerramento'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({data:expect.objectContaining({nota_fiscal:true})})));
});
it('pays selected item quantities with split forms and keeps the comanda open',async()=>{
 render(<ComandaDetails {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Pagar itens'}));
 fireEvent.change(screen.getByLabelText('Quantidade a pagar de Consumo'),{target:{value:'2'}});
 fireEvent.click(screen.getByRole('button',{name:'Usar total dos itens no pagamento'}));
 fireEvent.change(screen.getByLabelText('Valor'),{target:{value:'10'}});
 fireEvent.click(screen.getByRole('button',{name:'+ Dividir pagamento'}));
 fireEvent.change(screen.getAllByLabelText('Forma de pagamento')[1],{target:{value:'deferred'}});
 fireEvent.change(screen.getAllByLabelText('Valor')[1],{target:{value:'10'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar pagamento parcial'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'PAY',data:expect.objectContaining({mode:'ITEMS',items:[{item_id:'item',quantidade:2}],payments:[{forma_id:'pix',valor:10},{forma_id:'deferred',valor:10}]})})));
 expect(props.onClose).not.toHaveBeenCalled();
});
it('uses a rate share as a partial value and allows editing payment methods',async()=>{
 render(<ComandaDetails {...props}/>);
 fireEvent.change(screen.getByLabelText('Quantidade de pessoas'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'Calcular rateio'}));
 fireEvent.click(await screen.findByRole('button',{name:/Pessoa 1/}));
 expect(screen.getByLabelText('Valor a abater')).toHaveValue(26.67);
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar pagamento parcial'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'PAY',data:expect.objectContaining({mode:'VALUE',payments:[{forma_id:'pix',valor:26.67}]})})));
});
it('closes only the remaining balance after earlier receipts',async()=>{
 render(<ComandaDetails {...props} comanda={{...tab,paid_total:30}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Encerrar comanda'}));
 expect(screen.getByLabelText('Valor')).toHaveValue(50);
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar encerramento'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'CLOSE',data:expect.objectContaining({paid_total:30,payments:[{forma_id:'pix',valor:50}]})})));
});
it('registers a payer during deferred partial checkout without discarding payments',async()=>{
 mock.post.mockImplementation(path=>Promise.resolve({data:path==='/clientes'?{codigoCliente:2,nome:'Pagador',ativo:true}:{}}));
 render(<ComandaDetails {...props} comanda={{...tab,customer_codigo:null}}/>);
 fireEvent.click(screen.getByRole('button',{name:'Pagar por valor'}));
 fireEvent.change(screen.getByLabelText('Forma de pagamento'),{target:{value:'deferred'}});
 fireEvent.click(screen.getByRole('button',{name:'+ Cadastrar pagador'}));
 fireEvent.change(screen.getByLabelText('Nome'),{target:{value:'Pagador'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar'}));
 await waitFor(()=>expect(screen.getByLabelText('Cliente responsável pelo pagamento')).toHaveValue('2'));
 expect(screen.getByLabelText('Valor')).toHaveValue(80);
 expect(mock.post).not.toHaveBeenCalledWith('/comandas',expect.anything());
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));
 fireEvent.click(await screen.findByRole('button',{name:'Confirmar pagamento parcial'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'PAY',data:expect.objectContaining({customer_codigo:2})})));
});
