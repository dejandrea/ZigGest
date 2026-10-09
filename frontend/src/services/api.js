import { supabase } from './supabase';
import { supplierFromRow, supplierToRow, customerFromRow, customerToRow, ledgerFromRow, ledgerToRow, mesaFromRow, itemFromRow } from './dataMapping';

function client() {
  if (!supabase) throw new Error('Conexão Supabase não configurada.');
  return supabase;
}
export function applicationError(error) {
  const message = error?.message || 'Não foi possível concluir a operação.';
  if (error?.code === '42501' || error?.code === 'PGRST301') return new Error('Sem permissão ou sessão expirada. Entre novamente.');
  if (error?.code === '23503') return new Error('Este registro possui vínculos. Remova os vínculos ou desative o cadastro.');
  if (error?.code === 'PGRST116') return new Error('Registro n?o encontrado ou sem permissão.');
  if (error?.code === '23505') return new Error('Já existe um registro com esses dados.');
  return new Error(message);
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw applicationError(error);
  return data;
}
async function all(table, column) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const page = await result(client().from(table).select('*').order(column).order('id').range(start, start + 999));
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
    if (resource === 'mesas' && child === 'itens') {
      const row = await result(client().from('dining_table_items').update({ descricao: body.descricao, valor_unitario: Number(body.valorUnitario), quantidade: Number(body.quantidade) }).eq('codigo_mesa',code(id)).eq('id',itemId).select().single());
      return { data: itemFromRow(row) };
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
