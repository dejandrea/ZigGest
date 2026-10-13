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
beforeEach(()=>{vi.clearAllMocks();mock.admin=true;inventories=[structuredClone(draft)];mock.get.mockImplementation(path=>Promise.resolve({data:path==='/estoques'?{locations:[],balances:[]}:path==='/insumos'?stock:path==='/itens'||path==='/fornecedores'?[]:structuredClone(inventories)}));mock.post.mockImplementation((_path,body)=>{if(body.action==='SAVE'){inventories[0].revision++;for(const line of inventories[0].lines)line.contado=body.data.lines.find(l=>l.line_id===line.id).contado;}if(body.action==='CONFIRM'){inventories[0].status='CONFIRMED';inventories[0].confirmed_at='2026-10-11T03:00:00Z';}return Promise.resolve({data:inventories[0]});});});
it('registers a new item inside the draft and preserves unsaved physical counts',async()=>{
 const create={key:'s:egg',stockId:'egg',nome:'OVO',insumo:true,ativo:true,unidade:'UN'};
 const post=mock.post.getMockImplementation();mock.post.mockImplementation((path,body)=>{
  if(path==='/itens')return Promise.resolve({data:create});
  if(body.action==='ADD_ITEM'){inventories[0].revision++;inventories[0].lines.push({id:'egg-line',stock_item_id:'egg',nome:'OVO',unidade:'UN',saldo_referencia:0,contado:null});return Promise.resolve({data:structuredClone(inventories[0])});}
  return post(path,body);
 });
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca'),{target:{value:'4'}});
 fireEvent.click(screen.getByRole('button',{name:'Cadastrar novo item'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Salvar item'})).toBeEnabled());
 expect(screen.getByRole('checkbox',{name:/Insumo —/})).toBeChecked();
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Ovo'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 expect(await screen.findByLabelText('Quantidade física de OVO')).toHaveValue(null);
 expect(screen.getByLabelText('Quantidade física de Coca')).toHaveValue(4);
 expect(mock.post).toHaveBeenCalledWith('/inventarios',{id:'inventory',action:'ADD_ITEM',revision:0,data:{item_id:'egg'}});
 expect(mock.post.mock.calls.some(([,body])=>body.action==='CONFIRM'||body.action==='SAVE')).toBe(false);
});
it('retries including an already registered item without registering it again',async()=>{
 let failed=true;mock.post.mockImplementation((path,body)=>{
  if(path==='/itens')return Promise.resolve({data:{key:'s:egg',stockId:'egg',nome:'OVO',insumo:true,ativo:true,unidade:'UN'}});
  if(body.action==='ADD_ITEM'&&failed){failed=false;return Promise.reject(new Error('Conexão perdida'));}
  return Promise.resolve({data:{...draft,revision:1,lines:[...draft.lines,{id:'egg-line',stock_item_id:'egg',nome:'OVO',unidade:'UN',saldo_referencia:0,contado:null}]}});
 });
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca'),{target:{value:'4'}});
 fireEvent.click(screen.getByRole('button',{name:'Cadastrar novo item'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Salvar item'})).toBeEnabled());
 fireEvent.change(screen.getByLabelText('Nome do item'),{target:{value:'Ovo'}});fireEvent.click(screen.getByRole('button',{name:'Salvar item'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Conexão perdida');
 fireEvent.click(screen.getByRole('button',{name:'Tentar incluir itens'}));
 await screen.findByLabelText('Quantidade física de OVO');
 expect(screen.getByLabelText('Quantidade física de Coca')).toHaveValue(4);
 expect(mock.post.mock.calls.filter(([path])=>path==='/itens')).toHaveLength(1);
});
it('distinguishes zero from uncounted and rejects negative or overprecise counts',()=>{
 expect(inventoryCounts(draft.lines,{line1:'0',line2:''})).toEqual([{line_id:'line1',contado:0},{line_id:'line2',contado:null}]);
 expect(()=>inventoryCounts(draft.lines,{line1:'-1'})).toThrow('quantidades');
 expect(()=>inventoryCounts(draft.lines,{line1:'1.0001'})).toThrow('quantidades');
});
it('saves a draft before reviewing and applies adjustments only after confirmation',async()=>{
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca'),{target:{value:'0'}});
 expect(screen.getByRole('button',{name:'Revisar e confirmar'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Salvar contagem'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Revisar e confirmar'})).toBeEnabled());
 expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({action:'SAVE',revision:0,data:{lines:[{line_id:'line1',contado:0},{line_id:'line2',contado:null}]}}));
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
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({action:'OPEN',data:{kind:'INITIAL',location_id:null,item_id:'cola',descricao:'Estoque inicial',observacoes:''}})));
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
it('keeps the same insumo independent in two sectors in a general count',async()=>{
 inventories[0].lines=[{...draft.lines[0],id:'main-line',location_id:'main',location_nome:'Principal'},{...draft.lines[0],id:'kitchen-line',location_id:'kitchen',location_nome:'Cozinha',saldo_referencia:2}];
 render(<Inventario/>);fireEvent.click(await screen.findByRole('button',{name:'Abrir Contagem outubro'}));
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca / Principal'),{target:{value:'4'}});
 fireEvent.change(screen.getByLabelText('Quantidade física de Coca / Cozinha'),{target:{value:'1'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar contagem'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({data:{lines:[{line_id:'main-line',contado:4},{line_id:'kitchen-line',contado:1}]}})));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Revisar e confirmar'})).toBeEnabled());
 expect(screen.getByLabelText('Quantidade física de Coca / Principal')).toHaveValue(4);
 expect(screen.getByLabelText('Quantidade física de Coca / Cozinha')).toHaveValue(1);
});
it('opens an individual inventory in a chosen sector',async()=>{
 const get=mock.get.getMockImplementation();mock.get.mockImplementation(path=>path==='/estoques'?Promise.resolve({data:{locations:[{id:'kitchen',nome:'Cozinha',ativo:true}],balances:[]}}):get(path));
 render(<Inventario/>);await waitFor(()=>expect(screen.getByRole('button',{name:'+ Novo inventário'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'+ Novo inventário'}));
 fireEvent.change(screen.getByLabelText('Estoque / setor'),{target:{value:'kitchen'}});
 fireEvent.change(screen.getByLabelText('Abrangência'),{target:{value:'cola'}});
 fireEvent.change(screen.getByLabelText('Descrição'),{target:{value:'Cozinha hoje'}});
 fireEvent.click(screen.getByRole('button',{name:'Abrir contagem'}));
 await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/inventarios',expect.objectContaining({data:expect.objectContaining({location_id:'kitchen',item_id:'cola'})})));
});
