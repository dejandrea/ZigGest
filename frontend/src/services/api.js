import { supabase } from './supabase';
import {parseNfe} from './nfe';
import {manualInvoicePayload} from './manualInvoice';
import { stockFromRow,stockToRow,stockQuantity,componentsToRows,productFromRow, productToRow, supplierFromRow, supplierToRow, customerFromRow, customerToRow, ledgerFromRow, ledgerToRow, mesaFromRow, itemFromRow } from './dataMapping';

function client() {
  if (!supabase) throw new Error('Conexão Supabase não configurada.');
  return supabase;
}
export function applicationError(error) {
  const message = error?.message || 'Não foi possível concluir a operação.';
  if (error?.code === '42501' || error?.code === 'PGRST301') return new Error('Sem permissão ou sessão expirada. Entre novamente.');
  if (error?.code === '23503') return new Error('Este registro possui vínculos. Remova os vínculos ou desative o cadastro.');
  if (error?.code === 'PGRST116') return new Error('Registro n?o encontrado ou sem permissão.');
  if (error?.code === '23505' && error?.message?.includes('products_codigo_barras_key')) return new Error('Este código de barras já está cadastrado em outro produto.');
  if (error?.code === '23505' && error?.message?.includes('stock_invoice')) return new Error('Esta nota já foi registrada no estoque.');
  if (error?.code === '23505') return new Error('Já existe um registro com esses dados.');
  return new Error(message);
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw applicationError(error);
  return data;
}
async function all(table, column, columns='*') {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const page = await result(client().from(table).select(columns).order(column).order('id').range(start, start + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}
function code(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Código inválido.');
  return number;
}
function route(path) { return path.split('/').filter(Boolean); }
const api = {
  async get(path) {
    const [resource, id, child] = route(path);
    if(resource==='entradas-nfe'&&id){
      const invoice=await result(client().from('stock_invoices').select('*').eq('id',id).single());
      const items=await result(client().from('stock_invoice_items').select('*').eq('invoice_id',id).order('n_item'));
      return {data:{...invoice,itens:items}};
    }
    if(resource==='insumos')return {data:(await all('stock_items','codigo_insumo')).map(stockFromRow)};
    if(resource==='movimentacoes-estoque'){
      const rows=await all('stock_movements','created_at','id,tipo,descricao,quantidade,fator,product_id,actor_id,observacoes,created_at,ocorrido_em,invoice_id'), lines=await all('stock_movement_lines','movement_id');
      return {data:rows.map(r=>({...r,linhas:lines.filter(l=>l.movement_id===r.id)}))};
    }
    if (resource === 'produtos') {
      const components=await all('product_components','product_id');
      if (!id) return {data:(await all('products','codigo_produto')).map(r=>productFromRow({...r,componentes:components.filter(c=>c.product_id===r.id)}))};
      const row=await result(client().from('products').select('*').eq('codigo_produto',code(id)).single());
      return {data:productFromRow({...row,componentes:components.filter(c=>c.product_id===row.id)})};
    }
    if (resource === 'fornecedores') {
      if (!id) return {data:(await all('suppliers','codigo_fornecedor')).map(supplierFromRow)};
      return {data:supplierFromRow(await result(client().from('suppliers').select('*').eq('codigo_fornecedor',code(id)).single()))};
    }
    if (resource === 'clientes') {
      if (!id) return { data: (await all('customers','codigo_cliente')).map(customerFromRow) };
      const row = await result(client().from('customers').select('*').eq('codigo_cliente',code(id)).single());
      return { data: customerFromRow(row) };
    }
    if (resource === 'contas') {
      const [rows, customers] = await Promise.all([all('customer_ledger','codigo_conta'), all('customers','codigo_cliente')]);
      const filtered = id ? rows.filter(row => row.codigo_conta === code(id)) : rows;
      return { data: filtered.map(row => ledgerFromRow(row, customers)) };
    }
    if (resource === 'mesas') {
      if (id && child === 'itens') {
        const rows = await result(client().from('dining_table_items').select('*').eq('codigo_mesa',code(id)).order('created_at'));
        return { data: rows.map(itemFromRow) };
      }
      const rows = await all('dining_tables','codigo_mesa');
      return { data: rows.map(mesaFromRow) };
    }
    throw new Error('Operação não disponível.');
  },
  async post(path, body) {
    const [resource,id,child] = route(path);
    if(resource==='entradas-nfe-manual')return {data:await result(client().rpc('record_manual_stock_invoice',manualInvoicePayload(body)))};
    if(resource==='entradas-nfe'){
      const invoice=parseNfe(body.xml);
      if(!Array.isArray(body.lines)||body.lines.length!==invoice.items.length)throw new Error('Vincule todos os itens da NF-e.');
      const seen=new Set(),lines=body.lines.map(line=>{
        if(!invoice.items.some(i=>i.line===line.line)||seen.has(line.line)||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(line.stockItemId))throw new Error('Vínculo de item inválido.');
        seen.add(line.line);
        const quantity=stockQuantity(line.quantity),factor=stockQuantity(line.factor),total=quantity*factor;
        if(total>999999999999999.999||Math.abs(total*1000-Math.round(total*1000))>0.00001)throw new Error('Conversão fora da precisão suportada.');
        return {n_item:line.line,stock_item_id:line.stockItemId,quantidade:quantity,fator:factor};
      });
      const date=body.dataEntrada?new Date(body.dataEntrada):null;
      if(date&&(!Number.isFinite(date.getTime())||date.getTime()>Date.now()))throw new Error('Informe uma data passada ou atual.');
      return {data:await result(client().rpc('import_stock_invoice',{p_request:body.requestId,p_xml:body.xml,p_lines:lines,p_ocorrido_em:date?.toISOString()??null,p_observacoes:body.observacoes??''}))};
    }
    if(resource==='insumos'){
      const changes=stockToRow(body);return {data:stockFromRow(await result(client().from('stock_items').insert(changes).select().single()))};
    }
    if(resource==='movimentacoes-estoque'){
      const qty=stockQuantity(body.quantidade),factor=body.tipo==='ENTRADA'?stockQuantity(body.fator):1;
      if(!['ENTRADA','SAIDA'].includes(body.tipo))throw new Error('Tipo de movimentação inválido.');
      const date=body.dataEntrada?new Date(body.dataEntrada):null;
      if(date&&(!Number.isFinite(date.getTime())||date.getTime()>Date.now()))throw new Error('Informe uma data passada ou atual.');
      if(date&&body.tipo!=='ENTRADA')throw new Error('Data retroativa somente para entradas.');
      return {data:await result(client().rpc('record_stock_movement',{...(date?{p_ocorrido_em:date.toISOString()}:{}),p_request:body.requestId,p_tipo:body.tipo,p_item:body.tipo==='ENTRADA'?body.itemId:null,p_produto:body.tipo==='SAIDA'?code(body.codigoProduto):null,p_quantidade:qty,p_fator:factor,p_observacoes:body.observacoes??''}))};
    }
    if (resource === 'produtos') {
      const changes=productToRow(body);
      if(body.componentes!==undefined){const components=componentsToRows(body.componentes);return {data:productFromRow(await result(client().rpc('save_product_with_stock',{p_codigo:null,p_dados:changes,p_componentes:components})))};}
      return {data:productFromRow(await result(client().from('products').insert(changes).select().single()))};
    }
    if (resource === 'fornecedores') return {data:supplierFromRow(await result(client().from('suppliers').insert(supplierToRow(body)).select().single()))};
    if (resource === 'clientes') {
      const row = await result(client().from('customers').insert(customerToRow(body)).select().single());
      return { data: customerFromRow(row) };
    }
    if (resource === 'contas') {
      const row = await result(client().from('customer_ledger').insert(ledgerToRow(body)).select().single());
      return { data: ledgerFromRow(row) };
    }
    if (resource === 'mesas' && !id) {
      const row = await result(client().from('dining_tables').insert({ nome_cliente: body.nomeMesa ?? body.nomeCliente ?? '' }).select().single());
      return { data: mesaFromRow(row) };
    }
    if (resource === 'mesas' && child === 'itens') {
      const row = await result(client().from('dining_table_items').insert({
        codigo_mesa: code(id), descricao: body.descricao, valor_unitario: Number(body.valorUnitario), quantidade: Number(body.quantidade),
      }).select().single());
      return { data: itemFromRow(row) };
    }
    throw new Error('Operação não disponível.');
  },
  async put(path, body) {
    const [resource,id,child,itemId] = route(path);
    if(resource==='insumos'){
      const changes=stockToRow(body,true);return {data:stockFromRow(await result(client().from('stock_items').update(changes).eq('codigo_insumo',code(id)).select().single()))};
    }
    if (resource === 'mesas' && child === 'itens') {
      const row = await result(client().from('dining_table_items').update({ descricao: body.descricao, valor_unitario: Number(body.valorUnitario), quantidade: Number(body.quantidade) }).eq('codigo_mesa',code(id)).eq('id',itemId).select().single());
      return { data: itemFromRow(row) };
    }
    if (resource === 'produtos') {
      const changes=productToRow(body), productCode=code(id);
      if(body.componentes!==undefined){const components=componentsToRows(body.componentes);return {data:productFromRow(await result(client().rpc('save_product_with_stock',{p_codigo:productCode,p_dados:changes,p_componentes:components})))};}
      return {data:productFromRow(await result(client().from('products').update(changes).eq('codigo_produto',productCode).select().single()))};
    }
    if (resource === 'fornecedores') return {data:supplierFromRow(await result(client().from('suppliers').update(supplierToRow(body)).eq('codigo_fornecedor',code(id)).select().single()))};
    if (resource === 'clientes') {
      const row = await result(client().from('customers').update(customerToRow(body)).eq('codigo_cliente',code(id)).select().single());
      return { data: customerFromRow(row) };
    }
    if (resource === 'contas') {
      const row = await result(client().from('customer_ledger').update(ledgerToRow(body)).eq('codigo_conta',code(id)).select().single());
      return { data: ledgerFromRow(row) };
    }
    if (resource === 'mesas') {
      const changes = {};
      if (body.status) changes.status = body.status;
      if (body.nomeCliente !== undefined) changes.nome_cliente = body.nomeCliente;
      const row = await result(client().from('dining_tables').update(changes).eq('codigo_mesa',code(id)).select().single());
      return { data: mesaFromRow(row) };
    }
    throw new Error('Operação não disponível.');
  },
  async delete(path) {
    const [resource,id,child,itemId] = route(path);
    const table = resource === 'clientes' ? 'customers' : resource === 'contas' ? 'customer_ledger' : resource === 'mesas' ? 'dining_tables' : null;
    if (resource === 'mesas' && child === 'itens') {
      const rows = await result(client().from('dining_table_items').delete().eq('codigo_mesa',code(id)).eq('id',itemId).select('id'));
      if (!rows.length) throw new Error('Item não encontrado ou sem permissão.');
      return { data: null };
    }
    if (!table) throw new Error('Operação não disponível.');
    const column = resource === 'clientes' ? 'codigo_cliente' : resource === 'contas' ? 'codigo_conta' : 'codigo_mesa';
    const rows = await result(client().from(table).delete().eq(column,code(id)).select('id'));
    if (!rows.length) throw new Error('Registro não encontrado ou sem permissão.');
    return { data: null };
  },
};
export default api;
