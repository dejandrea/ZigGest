import {beforeEach,describe,expect,it,vi} from 'vitest';
import api from './api';
import {nfeXml} from '../testFixtures/nfe';
import {installmentPlan} from './payables';
const mock=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),responses:[],queries:[]}));
it('loads location balances with composite ordering and routes stock operations',async()=>{
 mock.responses=[{data:[{id:'main',nome:'Principal'}]},{data:[{stock_item_id:'cola',location_id:'main',saldo:24}]}];
 const {data}=await api.get('/estoques');expect(data.balances[0].saldo).toBe(24);
 const balanceQuery=mock.queries.find(q=>q.table==='stock_balances');expect(balanceQuery.calls.filter(c=>c[0]==='order')).toEqual([['order','stock_item_id'],['order','location_id']]);
 await api.post('/estoques',{id:'kitchen',nome:'Cozinha',ativo:true,principal:true});
 expect(mock.rpc).toHaveBeenCalledWith('stock_location_operation',{p_id:'kitchen',p_data:{nome:'Cozinha',ativo:true}});
 await api.post('/estoque-transferencias',{id:'transfer',origem_id:'main',destino_id:'kitchen',item_id:'cola',quantidade:'12',saldo:999});
 expect(mock.rpc).toHaveBeenCalledWith('transfer_stock',{p_id:'transfer',p_data:{origem_id:'main',destino_id:'kitchen',item_id:'cola',quantidade:12,observacoes:''}});
});
it('routes cash opening and comanda closing through atomic RPCs',async()=>{
 await api.post('/caixa',{id:'cash',action:'OPEN',data:{conta_id:'account',categoria_id:'sales',method_ids:['pix']}});
 expect(mock.rpc).toHaveBeenCalledWith('cash_operation',{p_id:'cash',p_action:'OPEN',p_data:{conta_id:'account',categoria_id:'sales',method_ids:['pix']}});
 await api.post('/comandas',{id:'tab',action:'CLOSE',data:{request_id:'close',total:80,payments:[{forma_id:'pix',valor:50},{forma_id:'credit',valor:30}]}});
 expect(mock.rpc).toHaveBeenCalledWith('comanda_operation',expect.objectContaining({p_id:'tab',p_action:'CLOSE'}));
});
it('loads the cash dashboard and routes sale actions through guarded RPCs',async()=>{
 mock.rpc.mockResolvedValue({data:[{id:'cash',sales:[],movements:[],expected_cash:100}],error:null});
 const {data}=await api.get('/caixa');expect(data[0].expected_cash).toBe(100);expect(mock.rpc).toHaveBeenCalledWith('cash_dashboard');
 await api.post('/caixa-vendas',{id:'sale',action:'REOPEN',data:{request_id:'request',motivo:'Corrigir venda'}});
 expect(mock.rpc).toHaveBeenCalledWith('cash_sale_operation',{p_id:'sale',p_action:'REOPEN',p_data:{request_id:'request',motivo:'Corrigir venda'}});
});
it('links comandas to their consumption and payments and uses the renamed item route',async()=>{
 mock.responses=[{data:[{id:'c1',codigo_mesa:1},{id:'c2',codigo_mesa:2}]},{data:[{id:'i1',codigo_mesa:1}]},{data:[{id:'close',comanda_id:'c1'}]},{data:[{id:'pay',closure_id:'close'}]}];
 const {data}=await api.get('/comandas');expect(data[0].itens).toHaveLength(1);expect(data[0].pagamentos).toHaveLength(1);expect(data[1].pagamentos).toHaveLength(0);
 mock.responses=[{data:{id:'item',codigo_mesa:1,quantidade:1,valor_unitario:5,total:5}}];
 await api.post('/comandas/1/itens',{descricao:'Consumo',valorUnitario:5,quantidade:1});
 expect(mock.queries.at(-1).table).toBe('dining_table_items');
});
it('loads inventory lines and sends counts through the inventory RPC',async()=>{
 mock.responses=[{data:[{id:'inventory',descricao:'Inventário'}]},{data:[{id:'line',inventory_id:'inventory',stock_item_id:'item',contado:0}]}];
 const {data}=await api.get('/inventarios');expect(data[0].lines[0].contado).toBe(0);
 await api.post('/inventarios',{id:'inventory',action:'SAVE',revision:0,data:{lines:[{item_id:'item',contado:0}]}});
 expect(mock.rpc).toHaveBeenCalledWith('inventory_operation',{p_id:'inventory',p_action:'SAVE',p_revision:0,p_data:{lines:[{item_id:'item',contado:0}]}});
});
it('loads all partial receipts and aggregates quantities paid across settlements',async()=>{
 mock.responses=[{data:[{id:'c1',codigo_mesa:1,total_geral:80,paid_total:30}]},{data:[{id:'item',codigo_mesa:1,quantidade:8}]},{data:[{id:'s1',comanda_id:'c1',kind:'ITEMS',cash_session_id:'cash',items:[{item_id:'item',quantidade:1}]},{id:'s2',comanda_id:'c1',kind:'ITEMS',cash_session_id:'cash',items:[{item_id:'item',quantidade:2}]}]},{data:[{id:'p1',closure_id:'s1'},{id:'p2',closure_id:'s2'}]}];
 const {data}=await api.get('/comandas');
 expect(data[0].lancamentos).toHaveLength(2);expect(data[0].pagamentos).toHaveLength(2);
 expect(data[0].pagamentos.every(p=>p.cash_session_id==='cash')).toBe(true);
 expect(data[0].itens[0].quantidade_paga).toBe(3);expect(data[0].encerramento).toBeUndefined();
});
vi.mock('./supabase',()=>({supabase:{from:mock.from,rpc:mock.rpc}}));
it('calculates separate account balances from balanced transfer entries',async()=>{
 mock.responses=[{data:[{id:'cash',nome:'Caixa'},{id:'bank',nome:'Banco'}]},{data:[]},{data:[]},{data:[]},{data:[{conta_id:'cash',valor:100},{conta_id:'cash',valor:-30},{conta_id:'bank',valor:30}]}];
 const {data}=await api.get('/financeiro');
 expect(data.accounts.map(a=>a.saldo)).toEqual([70,30]);
 expect(data.accounts.reduce((s,a)=>s+a.saldo,0)).toBe(100);
 expect(mock.queries.find(q=>q.table==='financial_operations').calls.find(c=>c[0]==='select')[1]).not.toContain('payload');
});
it('routes financial movements through the validated RPC without a forged balance',async()=>{
 await api.post('/financeiro-movimentacoes',{requestId:'r',tipo:'TRANSFER',valor:'30',data:'2026-01-01',descricao:'Transferência',contaId:'cash',destinoId:'bank',saldo:999});
 expect(mock.rpc).toHaveBeenCalledWith('finance_operation',expect.objectContaining({p_id:'r',p_data:expect.objectContaining({tipo:'TRANSFER',valor:30,conta_id:'cash',destino_id:'bank'})}));
 expect(mock.rpc.mock.calls.at(-1)[1].p_data).not.toHaveProperty('saldo');
});
it('stores optional supplier and entry value in the atomic entry RPC',async()=>{
 await api.post('/movimentacoes-estoque',{tipo:'ENTRADA',requestId:'entry',itemId:'item',quantidade:'2',fator:'12',fornecedorId:'supplier',totalEntrada:'96.00'});
 expect(mock.rpc).toHaveBeenCalledWith('record_stock_entry',{p_request:'entry',p_item:'item',p_quantidade:2,p_fator:12,p_observacoes:'',p_ocorrido_em:null,p_supplier:'supplier',p_total:96});
});
it('saves a payable with explicit fields and rejects mismatched installments',async()=>{
 const body={requestId:'request',sourceId:'entry',fornecedorNome:'Fornecedor',descricao:'Compra',total:'100',parcelas:installmentPlan('100',3,'2026-01-01'),saldo:999};
 await api.post('/contas-pagar',body);
 expect(mock.rpc).toHaveBeenCalledWith('save_supplier_payable',expect.objectContaining({p_id:'request',p_source:'entry',p_edit:false,p_data:expect.objectContaining({total:100})}));
 expect(mock.rpc.mock.calls.at(-1)[1].p_data).not.toHaveProperty('saldo');
 await expect(api.post('/contas-pagar',{...body,total:'101'})).rejects.toThrow('soma');
});
it('loads invoice installments and matches the saved supplier for finance',async()=>{
 const xml=nfeXml().replace('</infNFe>','<cobr><dup><nDup>001</nDup><dVenc>2026-12-01</dVenc><vDup>96.00</vDup></dup></cobr><pag><detPag><tPag>15</tPag><vPag>96.00</vPag></detPag></pag></infNFe>');
 mock.responses=[{data:{id:'entry',tipo:'ENTRADA',invoice_id:'invoice',observacoes:'Compra'}},{data:[]},{data:{emitente_nome:'Fornecedor NF',emitente_documento:'12345678000195',numero:'1',serie:'1',total:96,xml_original:xml}},{data:[{id:'supplier',documento:'12.345.678/0001-95'}]}];
 const {data}=await api.get('/financeiro-entrada/entry');
 expect(data).toMatchObject({sourceId:'entry',fornecedorId:'supplier',fornecedorNome:'Fornecedor NF',total:'96',parcelas:[{numero:'001',vencimento:'2026-12-01',valor:'96.00',formaPagamento:'Boleto bancário'}]});
});
beforeEach(()=>{
  mock.responses=[];mock.queries=[];
  mock.rpc.mockResolvedValue({data:{},error:null});
  mock.from.mockImplementation(table=>{
    const query={table,calls:[]};
    for(const method of ['select','order','range','insert','update','delete','eq','single']){
      query[method]=(...args)=>{query.calls.push([method,...args]);return query;};
    }
    query.then=(success,failure)=>Promise.resolve(mock.responses.shift()??{data:[],error:null}).then(success,failure);
    mock.queries.push(query);return query;
  });
});

it('saves a product and its stock consumption in one RPC with an allowlist',async()=>{
 const item='11111111-1111-1111-1111-111111111111';
 mock.rpc.mockResolvedValue({data:{id:'p1',codigo_produto:1,nome:'Pack',custo:0,preco_venda:48,componentes:[{stock_item_id:item,quantidade:12}]},error:null});
 await api.post('/produtos',{nome:'Pack',precoVenda:48,componentes:[{stock_item_id:item,quantidade:'12'}],saldo:999});
 expect(mock.rpc).toHaveBeenCalledWith('save_product_with_stock',{p_codigo:null,p_dados:{nome:'Pack',preco_venda:48},p_componentes:[{stock_item_id:item,quantidade:12}]});
 expect(mock.from).not.toHaveBeenCalled();
});
it('blocks duplicate or zero recipe quantities before sending a query',async()=>{
 const item='11111111-1111-1111-1111-111111111111';
 await expect(api.put('/produtos/1',{componentes:[{stock_item_id:item,quantidade:1},{stock_item_id:item,quantidade:12}]})).rejects.toThrow('apenas uma vez');
 await expect(api.put('/produtos/1',{componentes:[{stock_item_id:item,quantidade:0}]})).rejects.toThrow('Quantidade');
 expect(mock.rpc).not.toHaveBeenCalled();
});
it('routes inventory conversion through the guarded RPC and ignores a client balance',async()=>{
 await api.post('/movimentacoes-estoque',{tipo:'ENTRADA',itemId:'fixture-item',requestId:'fixture-request',quantidade:12,fator:12,observacoes:'Compra',saldo:999});
 expect(mock.rpc).toHaveBeenCalledWith('record_stock_movement',{p_request:'fixture-request',p_tipo:'ENTRADA',p_item:'fixture-item',p_produto:null,p_quantidade:12,p_fator:12,p_observacoes:'Compra'});
});
it('allows stock item metadata edits but never balance or base unit changes',async()=>{
 mock.responses=[{data:{id:'i1',codigo_insumo:1,nome:'Coca',unidade:'UN',saldo:144,estoque_minimo:0,ativo:true},error:null}];
 await api.put('/insumos/1',{nome:'Coca',saldo:999,unidade:'KG',estoqueMinimo:12});
 expect(mock.queries[0].calls).toContainEqual(['update',{nome:'Coca',estoque_minimo:12}]);
});
describe('Supabase CRUD adapter',()=>{
  it('imports invoice conversions in one RPC without trusting invoice metadata from the client',async()=>{
    const xml=nfeXml(),item='11111111-1111-1111-1111-111111111111';
    await api.post('/entradas-nfe',{requestId:'request',xml,lines:[{line:1,stockItemId:item,quantity:'2',factor:'12'}],saldo:99,chave:'forged'});
    expect(mock.rpc).toHaveBeenCalledWith('import_stock_invoice',{p_request:'request',p_xml:xml,p_lines:[{n_item:1,stock_item_id:item,quantidade:2,fator:12}],p_ocorrido_em:null,p_observacoes:''});
  });
  it('rejects unmapped and duplicate NF-e lines and imprecise conversions before calling the RPC',async()=>{
    const item='11111111-1111-1111-1111-111111111111',line={line:1,stockItemId:item,quantity:2,factor:12};
    await expect(api.post('/entradas-nfe',{xml:nfeXml(),lines:[]})).rejects.toThrow('todos');
    await expect(api.post('/entradas-nfe',{xml:nfeXml({items:2}),lines:[line,line]})).rejects.toThrow('Vínculo');
    await expect(api.post('/entradas-nfe',{xml:nfeXml(),lines:[{...line,quantity:0.001,factor:0.001}]})).rejects.toThrow('precisão');
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('preserves an absent minimum and persists the negative stock policy',async()=>{
    mock.responses=[{data:{id:'i1',codigo_insumo:1,estoque_minimo:null,saldo:-2,bloquear_estoque_negativo:false},error:null}];
    const {data}=await api.put('/insumos/1',{estoqueMinimo:'',bloquearEstoqueNegativo:false,saldo:999});
    expect(mock.queries[0].calls).toContainEqual(['update',{estoque_minimo:null,bloquear_estoque_negativo:false}]);
    expect(data).toMatchObject({estoqueMinimo:null,saldo:-2,bloquearEstoqueNegativo:false});
  });
  it('sends the arrival date and rejects invalid or future dates',async()=>{
    const body={tipo:'ENTRADA',itemId:'i1',requestId:'r1',quantidade:1,fator:1,dataEntrada:'2026-01-01T10:30:00-03:00'};
    await api.post('/movimentacoes-estoque',body);
    expect(mock.rpc).toHaveBeenCalledWith('record_stock_movement',expect.objectContaining({p_ocorrido_em:'2026-01-01T13:30:00.000Z'}));
    const count=mock.rpc.mock.calls.length;
    await expect(api.post('/movimentacoes-estoque',{...body,dataEntrada:'invalid'})).rejects.toThrow('data');
    await expect(api.post('/movimentacoes-estoque',{...body,dataEntrada:'2999-01-01'})).rejects.toThrow('data');
    expect(mock.rpc).toHaveBeenCalledTimes(count);
  });
  it('loads every page instead of silently truncating at 1000',async()=>{
    mock.responses=[{data:Array.from({length:1000},(_,i)=>({id:i,codigo_cliente:i+1,nome:'Fixture'})),error:null},{data:[{id:1001,codigo_cliente:1001,nome:'Fixture'}],error:null}];
    const response=await api.get('/clientes');expect(response.data).toHaveLength(1001);
    expect(mock.queries[1].calls).toContainEqual(['range',1000,1999]);
  });
  it('updates notes and prevents injecting a computed total',async()=>{
    mock.responses=[{data:{codigo_conta:1,customer_codigo:1,amount:1,entry_type:'DEBIT'},error:null}];
    await api.put('/contas/1',{codigoCliente:1,valor:1,tipo:'debito',observacoes:'Edited note',totalPendente:999});
    expect(mock.queries[0].calls).toContainEqual(['update',{customer_codigo:1,entry_type:'DEBIT',amount:1,notes:'Edited note'}]);
    expect(mock.queries[0].calls).toContainEqual(['eq','codigo_conta',1]);
  });
  it('does not report an invisible delete as successful',async()=>{
    await expect(api.delete('/clientes/1')).rejects.toThrow('sem permissão');
  });
  it('returns a useful foreign-key error',async()=>{
    mock.responses=[{data:null,error:{code:'23503',message:'raw'}}];
    await expect(api.delete('/clientes/1')).rejects.toThrow('vínculos');
  });
  it('updates only a mesa item belonging to the requested mesa',async()=>{
    mock.responses=[{data:{id:'fixture',codigo_mesa:2,quantidade:2,valor_unitario:3,total:6},error:null}];
    await api.put('/mesas/2/itens/fixture',{descricao:'Fixture item',valorUnitario:3,quantidade:2});
    expect(mock.queries[0].table).toBe('dining_table_items');
    expect(mock.queries[0].calls).toContainEqual(['eq','codigo_mesa',2]);
    expect(mock.queries[0].calls).toContainEqual(['eq','id','fixture']);
  });
});

it('supplier updates allow editable fields only and preserve the business code',async()=>{
 mock.responses=[{data:{codigo_fornecedor:3,nome:'Fornecedor',ativo:false},error:null}];
 await api.put('/fornecedores/3',{nome:' Fornecedor ',nomeFantasia:' Marca ',ativo:false,codigoFornecedor:999,id:'injected',created_at:'injected'});
 expect(mock.queries[0].table).toBe('suppliers');
 expect(mock.queries[0].calls).toContainEqual(['update',{nome:'Fornecedor',nome_fantasia:'Marca',ativo:false}]);
 expect(mock.queries[0].calls).toContainEqual(['eq','codigo_fornecedor',3]);
});

it('stores an optional barcode as null and never converts leading zeroes to a number',async()=>{
 mock.responses=[{data:{codigo_produto:1,nome:'Avulso',custo:0,preco_venda:0,ativo:true},error:null}];
 await api.post('/produtos',{nome:'Avulso',codigoBarras:'   ',custo:'0',precoVenda:'0',unidade:'UN'});
 expect(mock.queries[0].calls).toContainEqual(['insert',{nome:'Avulso',codigo_barras:null,custo:0,preco_venda:0,unidade:'UN'}]);
 mock.responses=[{data:{codigo_produto:1,nome:'Avulso',codigo_barras:'001234',custo:0,preco_venda:1,ativo:true},error:null}];
 const response=await api.put('/produtos/1',{codigoBarras:' 001234 ',precoVenda:'1,25',codigoProduto:9,id:'injected',estoque:100,created_at:'injected'});
 expect(mock.queries[1].calls).toContainEqual(['update',{codigo_barras:'001234',preco_venda:1.25}]);
 expect(mock.queries[1].calls).toContainEqual(['eq','codigo_produto',1]);
 expect(response.data.codigoBarras).toBe('001234');
});
it.each(['-1','Infinity','abc','1.234','',null])('rejects invalid product prices before contacting the database: %s',async value=>{
 await expect(api.post('/produtos',{nome:'Teste',precoVenda:value})).rejects.toThrow('inválido');
 expect(mock.from).not.toHaveBeenCalled();
});
it('allows clearing an existing barcode and explains a duplicate barcode',async()=>{
 mock.responses=[{data:{codigo_produto:1,nome:'Teste',custo:0,preco_venda:0},error:null}];
 await api.put('/produtos/1',{codigoBarras:''});
 expect(mock.queries[0].calls).toContainEqual(['update',{codigo_barras:null}]);
 mock.responses=[{data:null,error:{code:'23505',message:'duplicate key violates products_codigo_barras_key'}}];
 await expect(api.post('/produtos',{nome:'Teste',codigoBarras:'001234'})).rejects.toThrow('código de barras');
});
