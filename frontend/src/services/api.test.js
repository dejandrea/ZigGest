import {beforeEach,describe,expect,it,vi} from 'vitest';
import api from './api';
const mock=vi.hoisted(()=>({from:vi.fn(),responses:[],queries:[]}));
vi.mock('./supabase',()=>({supabase:{from:mock.from}}));
beforeEach(()=>{
  mock.responses=[];mock.queries=[];
  mock.from.mockImplementation(table=>{
    const query={table,calls:[]};
    for(const method of ['select','order','range','insert','update','delete','eq','single']){
      query[method]=(...args)=>{query.calls.push([method,...args]);return query;};
    }
    query.then=(success,failure)=>Promise.resolve(mock.responses.shift()??{data:[],error:null}).then(success,failure);
    mock.queries.push(query);return query;
  });
});
describe('Supabase CRUD adapter',()=>{
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
