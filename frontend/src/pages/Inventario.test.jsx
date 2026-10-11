import React from 'react';
import {beforeEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import Inventario,{inventoryCounts} from './Inventario';
const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),admin:true}));
vi.mock('../services/api',()=>({default:mock}));
vi.mock('../auth/AuthContext',()=>({useAuth:()=>({isAdmin:mock.admin})}));
const stock=[{_id:'cola',nome:'Coca',ativo:true,unidade:'UN'},{_id:'water',nome:'Água',ativo:true,unidade:'UN'}];
const draft={id:'inventory',descricao:'Contagem outubro',kind:'COUNT',status:'DRAFT',revision:0,created_at:'2026-10-11T03:00:00Z',lines:[{id:'line1',stock_item_id:'cola',nome:'Coca',unidade:'UN',saldo_referencia:5,contado:null},{id:'line2',stock_item_id:'water',nome:'Água',unidade:'UN',saldo_referencia:10,contado:null}]};
let inventories;
beforeEach(()=>{vi.clearAllMocks();mock.admin=true;inventories=[structuredClone(draft)];mock.get.mockImplementation(path=>Promise.resolve({data:path==='/insumos'?stock:structuredClone(inventories)}));mock.post.mockImplementation((_path,body)=>{if(body.action==='SAVE'){inventories[0].revision++;for(const line of inventories[0].lines)line.contado=body.data.lines.find(l=>l.item_id===line.stock_item_id).contado;}if(body.action==='CONFIRM'){inventories[0].status='CONFIRMED';inventories[0].confirmed_at='2026-10-11T03:00:00Z';}return Promise.resolve({data:inventories[0]});});});
it('distinguishes zero from uncounted and rejects negative or overprecise counts',()=>{
 expect(inventoryCounts(draft.lines,{cola:'0',water:''})).toEqual([{item_id:'cola',contado:0},{item_id:'water',contado:null}]);
 expect(()=>inventoryCounts(draft.lines,{cola:'-1'})).toThrow('quantidades');
 expect(()=>inventoryCounts(draft.lines,{cola:'1.0001'})).toThrow('quantidades');
});
it('saves a draft before reviewing and applies adjustments only after confirmation',async()=>{
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca'),{target:{value:'0'}});
 expect(screen.getByRole('button',{name:'Revisar e confirmar'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Salvar contagem'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Revisar e confirmar'})).toBeEnabled());
 expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({action:'SAVE',revision:0,data:{lines:[{item_id:'cola',contado:0},{item_id:'water',contado:null}]}}));
 fireEvent.click(screen.getByRole('button',{name:'Revisar e confirmar'}));expect(mock.post).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Confirmar inventário'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({action:'CONFIRM',revision:1})));
 await waitFor(()=>expect(screen.getByLabelText('Quantidade física de Coca')).toBeDisabled());
});
it('offers initial general or individual inventory without making a stock write on opening the modal',async()=>{
 render(<Inventario/>);await waitFor(()=>expect(screen.getByRole('button',{name:'+ Novo inventário'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'+ Novo inventário'}));
 fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'INITIAL'}});
 fireEvent.change(screen.getByLabelText('Abrangência'),{target:{value:'cola'}});
 fireEvent.change(screen.getByLabelText('Descrição'),{target:{value:'Estoque inicial'}});
 expect(screen.getByRole('option',{name:'Geral — todos os insumos ativos'})).toBeInTheDocument();
 expect(mock.post).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Abrir contagem'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({action:'OPEN',data:{kind:'INITIAL',item_id:'cola',descricao:'Estoque inicial',observacoes:''}})));
});
it('allows operators to count but hides confirmation and cancellation actions',async()=>{
 mock.admin=false;render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 expect(screen.getByRole('button',{name:'Salvar contagem'})).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Revisar e confirmar'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Cancelar inventário'})).not.toBeInTheDocument();
});
it('preserves physical counts and displays the error when confirmation is rejected',async()=>{
 inventories[0].lines[0].contado=3;mock.post.mockRejectedValue(new Error('O estoque mudou durante a contagem.'));
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));fireEvent.click(screen.getByRole('button',{name:'Revisar e confirmar'}));fireEvent.click(screen.getByRole('button',{name:'Confirmar inventário'}));
 await screen.findByRole('alert');expect(screen.getByLabelText('Quantidade física de Coca')).toHaveValue(3);
});
