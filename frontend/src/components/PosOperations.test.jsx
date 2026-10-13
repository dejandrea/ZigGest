import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import ComandaDetails from './ComandaDetails';
const api=vi.hoisted(()=>({post:vi.fn(),put:vi.fn(),delete:vi.fn()}));
vi.mock('../services/api',()=>({default:api}));
const tab={id:'pdv',codigo_mesa:1,origem:'PDV',nome_cliente:'Venda avulsa',status:'aberta',total_geral:80,paid_total:0,itens:[{id:'line',descricao:'Coca',quantidade:8,valor_unitario:10,total:80,product_id:'p'}],pagamentos:[]};
const props={comanda:tab,customers:[],finance:{methods:[{id:'cash',nome:'Dinheiro',tipo:'CASH',ativo:true}]},session:{},onClose:vi.fn(),onExit:vi.fn(),onSaved:vi.fn().mockResolvedValue(),workstation:true};
beforeEach(()=>{vi.clearAllMocks();api.post.mockResolvedValue({data:{}});});
it('changes quantities directly and keeps the product linked without opening an editor',async()=>{
 render(<ComandaDetails {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Aumentar quantidade de Coca'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'CHANGE_QUANTITY',data:expect.objectContaining({item_id:'line',expected_quantity:8,quantidade:9,total:80,paid_total:0})})));
 expect(api.put).not.toHaveBeenCalled();expect(screen.queryByLabelText('Descrição do consumo')).not.toBeInTheDocument();
});
it('prevents reducing already paid item quantities',()=>{
 render(<ComandaDetails {...props} comanda={{...tab,itens:[{...tab.itens[0],quantidade_paga:8}],paid_total:80}}/>);
 expect(screen.getByRole('button',{name:'Diminuir quantidade de Coca'})).toBeDisabled();
});
it('saves discounts and surcharges, and highlights the adjusted balance',async()=>{
 const view=render(<ComandaDetails {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:'Ajustes'}));
 fireEvent.change(screen.getByLabelText('Desconto (R$)'),{target:{value:'10'}});fireEvent.change(screen.getByLabelText('Acréscimo (R$)'),{target:{value:'5'}});
 fireEvent.click(screen.getByRole('button',{name:'Aplicar ajustes'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'SET_ADJUSTMENTS',data:expect.objectContaining({discount_amount:10,surcharge_amount:5,total:80,expected_discount:0,expected_surcharge:0})})));
 view.rerender(<ComandaDetails {...props} comanda={{...tab,discount_amount:10,surcharge_amount:5,total_geral:75}}/>);
 expect(screen.getByText(/Total da venda: R\$\s*75,00/)).toBeInTheDocument();
});
it('shows the cash change and sends tendered cash separately from the paid amount',async()=>{
 render(<ComandaDetails {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Finalizar venda'}));
 fireEvent.change(screen.getByLabelText('Recebido em dinheiro'),{target:{value:'100'}});
 expect(screen.getByText(/Troco total:/)).toHaveTextContent(/20,00/);
 fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));fireEvent.click(await screen.findByRole('button',{name:'Confirmar venda'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/comandas',expect.objectContaining({action:'CLOSE',data:expect.objectContaining({payments:[{forma_id:'cash',valor:80,recebido:100}]})})));
});
it('rejects insufficient cash and preserves the item avulso workflow',async()=>{
 render(<ComandaDetails {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Item avulso'}));
 fireEvent.change(screen.getByLabelText('Descrição do consumo'),{target:{value:'Serviço'}});fireEvent.change(screen.getByLabelText('Valor unitário'),{target:{value:'12.50'}});
 fireEvent.click(screen.getByRole('button',{name:'Adicionar consumo'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/comandas/1/itens',expect.objectContaining({descricao:'Serviço',valorUnitario:'12.50',quantidade:1})));
 fireEvent.click(screen.getByRole('button',{name:'Finalizar venda'}));fireEvent.change(screen.getByLabelText('Recebido em dinheiro'),{target:{value:'70'}});fireEvent.click(screen.getByRole('button',{name:'Revisar pagamento'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('O dinheiro recebido deve cobrir');
 expect(screen.queryByRole('button',{name:'Confirmar venda'})).not.toBeInTheDocument();
});
