import { supabase } from './supabase';
import {parseNfe} from './nfe';
import {manualInvoicePayload} from './manualInvoice';
import {cents,paymentMethods,payablePayload,payableFromRow} from './payables';
import {financePayload,settledAmount} from './finance';
import { stockFromRow,stockToRow,stockQuantity,componentsToRows,productFromRow, productToRow, supplierFromRow, supplierToRow, customerFromRow, customerToRow, ledgerFromRow, ledgerToRow, mesaFromRow, itemFromRow } from './dataMapping';

function client() {
  if (!supabase) throw new Error('Conexão Supabase não configurada.');
  return supabase;
}
export function applicationError(error) {
  const message = error?.message || 'Não foi possível concluir a operação.';
  if (error?.code === '42501' || error?.code === 'PGRST301') return new Error('Sem permissão ou sessão expirada. Entre novamente.');
  if (error?.code === '23503') return new Error('Este registro possui vínculos. Remova os vínculos ou desative o cadastro.');
  if (error?.code === 'PGRST116') return new Error('Registro não encontrado ou sem permissão.');
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
const operationColumns='id,tipo,valor,data,descricao,conta_id,destino_id,categoria_id,forma_id,parcela_id,debito_id,credito_id,estorno_de,motivo,actor_id,created_at';
const operations=()=>all('financial_operations','created_at',operationColumns);
const api = {
  async get(path) {
    const [resource, id, child] = route(path);
    if(resource==='inventarios'){
      const [rows,lines]=await Promise.all([all('stock_inventories','created_at'),all('stock_inventory_lines','inventory_id')]);
      return {data:rows.map(row=>({...row,lines:lines.filter(line=>line.inventory_id===row.id)}))};
    }
    if(resource==='financeiro'){
      const [accounts,categories,methods,ops,entries]=await Promise.all([all('financial_accounts','nome'),all('financial_categories','nome'),all('financial_payment_methods','nome'),operations(),all('financial_entries','operation_id')]);
      return {data:{accounts:accounts.map(a=>({...a,saldo:entries.filter(e=>e.conta_id===a.id).reduce((sum,e)=>sum+Math.round(Number(e.valor)*100),0)/100})),categories,methods,operations:ops,entries}};
    }
    if(resource==='contas-pagar'){
      const [rows,lines,ops]=await Promise.all([all('supplier_payables','created_at','id,stock_movement_id,fornecedor_id,fornecedor_nome,fornecedor_documento,descricao,total,observacoes,created_at,categoria_id'),all('supplier_payable_installments','payable_id'),operations()]);
      return {data:rows.map(r=>{const account=payableFromRow(r,lines);return {...account,locked:ops.some(o=>account.parcelas.some(p=>p.id===o.parcela_id)),parcelas:account.parcelas.map(p=>{const pago=settledAmount(ops,'parcela_id',p.id);return {...p,pago,aberto:Math.max(0,Math.round((Number(p.valor)-pago)*100)/100)};})};})};
    }
    if(resource==='financeiro-entrada'&&id){
      const movement=await result(client().from('stock_movements').select('id,tipo,descricao,invoice_id,fornecedor_id,total_entrada,observacoes').eq('id',id).single());
      if(movement.tipo!=='ENTRADA')throw new Error('Somente entradas podem gerar contas a pagar.');
      const existing=await result(client().from('supplier_payables').select('id').eq('stock_movement_id',id));
      if(existing.length)throw new Error('Esta entrada já possui lançamento no contas a pagar.');
      let draft={sourceId:id,fornecedorId:movement.fornecedor_id??'',fornecedorNome:'',fornecedorDocumento:'',descricao:'Entrada: '+movement.descricao,total:movement.total_entrada==null?'':String(movement.total_entrada),observacoes:movement.observacoes??'',parcelas:[]};
      if(movement.invoice_id){
        const invoice=await result(client().from('stock_invoices').select('*').eq('id',movement.invoice_id).single());
        draft={...draft,fornecedorNome:invoice.emitente_nome,fornecedorDocumento:invoice.emitente_documento,descricao:'NF-e '+invoice.numero+' / Série '+invoice.serie,total:String(invoice.total)};
        const suppliers=await all('suppliers','codigo_fornecedor');
        draft.fornecedorId=suppliers.find(s=>s.documento?.replace(/\D/g,'')===invoice.emitente_documento)?.id??'';
        if(invoice.xml_original){
          const parsed=parseNfe(invoice.xml_original),methods=[...new Set(parsed.payments.map(p=>p.description||paymentMethods[p.code]||('Código '+p.code)))];
          draft.parcelas=parsed.duplicates.map(p=>({...p,formaPagamento:methods.length===1?methods[0]:''}));
          draft.paymentInfo=parsed.payments.map(p=>(p.description||paymentMethods[p.code]||('Código '+p.code))+(p.amount?' — R$ '+Number(p.amount).toLocaleString('pt-BR',{minimumFractionDigits:2}):'')).join('; ');
          draft.defaultPaymentMethod=methods.length===1?methods[0]:'';
        }
      }else if(movement.fornecedor_id){
        const supplier=await result(client().from('suppliers').select('nome,documento').eq('id',movement.fornecedor_id).single());
        draft={...draft,fornecedorNome:supplier.nome,fornecedorDocumento:supplier.documento};
      }
      return {data:draft};
    }
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
      const [rows, customers,ops] = await Promise.all([all('customer_ledger','codigo_conta'), all('customers','codigo_cliente'),operations()]);
      const filtered = id ? rows.filter(row => row.codigo_conta === code(id)) : rows;
      return { data: filtered.map(row => {const settled=settledAmount(ops,row.entry_type==='DEBIT'?'debito_id':'credito_id',row.id);return {...ledgerFromRow(row,customers),categoriaId:row.categoria_id??'',financeOperationId:row.financial_operation_id,locked:!!row.financial_operation_id||ops.some(o=>o.debito_id===row.id||o.credito_id===row.id),baixado:settled,aberto:Math.max(0,Math.round((Number(row.amount)-settled)*100)/100),saldoCliente:Number(customers.find(c=>c.codigo_cliente===row.customer_codigo)?.total_pendente??0)};}) };
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
    if(resource==='inventarios')return {data:await result(client().rpc('inventory_operation',{p_id:body.id,p_action:body.action,p_revision:body.revision??null,p_data:body.data??{}}))};
    if(resource==='financeiro-config'){
      const allowed={accounts:['nome','tipo','ativo','saldo_inicial','data'],categories:['nome','natureza','ativo'],methods:['nome','tipo','ativo','conta_padrao_id','prazo_dias','max_parcelas','usar_pdv']}[id];
      if(!allowed)throw new Error('Cadastro financeiro inválido.');
      const data=Object.fromEntries(allowed.filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));
      return {data:await result(client().rpc('finance_config',{p_kind:id,p_id:body.id,p_data:data}))};
    }
    if(resource==='financeiro-movimentacoes')return {data:await result(client().rpc('finance_operation',{p_id:body.requestId,p_data:financePayload(body)}))};
    if(resource==='contas-pagar')return {data:await result(client().rpc('save_supplier_payable',{p_id:body.requestId,p_source:body.sourceId||null,p_data:payablePayload(body),p_edit:false}))};
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
      if(body.tipo==='ENTRADA'&&(body.fornecedorId!==undefined||body.totalEntrada!==undefined))return {data:await result(client().rpc('record_stock_entry',{p_request:body.requestId,p_item:body.itemId,p_quantidade:qty,p_fator:factor,p_observacoes:body.observacoes??'',p_ocorrido_em:date?.toISOString()??null,p_supplier:body.fornecedorId||null,p_total:body.totalEntrada===''||body.totalEntrada==null?null:cents(body.totalEntrada)/100}))};
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
    if(resource==='contas-pagar')return {data:await result(client().rpc('save_supplier_payable',{p_id:id,p_source:body.sourceId||null,p_data:payablePayload(body),p_edit:true}))};
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
