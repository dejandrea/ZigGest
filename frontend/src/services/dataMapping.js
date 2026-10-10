export function customerFromRow(row) {
  return {
    _id: row.id, codigoCliente: row.codigo_cliente, nome: row.nome,
    apelido: row.apelido ?? '', telefone: row.telefone ?? '', email: row.email ?? '',
    endereco: row.endereco ?? '', ativo: row.ativo, status: row.status,
    limite: Number(row.limite ?? 0), totalPendente: Number(row.total_pendente ?? 0),
    observacoes: row.observacoes ?? '', createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function boolean(value) { return value === true || value === 'true'; }
export function customerToRow(body) {
  const result = {};
  for (const key of ['nome','apelido','telefone','email','endereco','status','observacoes']) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  if (body.ativo !== undefined) result.ativo = boolean(body.ativo);
  if (body.limite !== undefined) {
    result.limite = Number(body.limite);
    if (!Number.isFinite(result.limite) || result.limite < 0) throw new Error('Limite inválido.');
  }
  return result;
}
export function ledgerFromRow(row, customers = []) {
  return {
    _id: row.id, codigoConta: row.codigo_conta, codigoCliente: row.customer_codigo,
    clienteNome: customers.find(c => c.codigo_cliente === row.customer_codigo)?.nome ?? 'Cliente não encontrado',
    valor: Number(row.amount), tipo: row.entry_type === 'CREDIT' ? 'credito' : 'debito',
    dataLancamento: row.issue_at, dataVencimento: row.due_at,
    observacoes: row.notes ?? '', createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
export function ledgerToRow(body) {
  const result = {};
  if (body.codigoCliente !== undefined) result.customer_codigo = Number(body.codigoCliente);
  if (body.tipo !== undefined) {
    if (!['debito','credito'].includes(body.tipo)) throw new Error('Tipo de lançamento inválido.');
    result.entry_type = body.tipo === 'credito' ? 'CREDIT' : 'DEBIT';
  }
  if (body.valor !== undefined) {
    result.amount = Number(body.valor);
    if (!Number.isFinite(result.amount) || result.amount < 0) throw new Error('Valor inválido.');
  }
  if (body.dataLancamento) result.issue_at = body.dataLancamento;
  if (body.dataVencimento) result.due_at = /^\d{4}-\d{2}-\d{2}$/.test(body.dataVencimento) ? body.dataVencimento + 'T12:00:00-03:00' : body.dataVencimento;
  if (body.observacoes !== undefined) result.notes = body.observacoes;
  if (body.categoriaId !== undefined) result.categoria_id=body.categoriaId||null;
  return result;
}
export function mesaFromRow(row) {
  return { _id: row.id, codigoMesa: row.codigo_mesa, nomeCliente: row.nome_cliente ?? '',
    status: row.status, totalGeral: Number(row.total_geral), dataCriacao: row.created_at };
}
export function itemFromRow(row) {
  return { _id: row.id, codigoMesa: row.codigo_mesa, descricao: row.descricao,
    valorUnitario: Number(row.valor_unitario), quantidade: row.quantidade, total: Number(row.total) };
}

export function supplierFromRow(row) {
 return {_id:row.id,codigoFornecedor:row.codigo_fornecedor,nome:row.nome,nomeFantasia:row.nome_fantasia??'',documento:row.documento??'',contato:row.contato??'',telefone:row.telefone??'',email:row.email??'',endereco:row.endereco??'',observacoes:row.observacoes??'',ativo:row.ativo,createdAt:row.created_at,updatedAt:row.updated_at};
}
export function supplierToRow(body) {
 const row={};
 for(const key of ['nome','documento','contato','telefone','email','endereco','observacoes']) if(body[key]!==undefined) row[key]=String(body[key]).trim();
 if(body.nomeFantasia!==undefined)row.nome_fantasia=String(body.nomeFantasia).trim();
 if(body.ativo!==undefined)row.ativo=boolean(body.ativo);
 if(row.nome!==undefined&&!row.nome)throw new Error('Informe o nome do fornecedor.');
 return row;
}

export const productUnits = ['UN','KG','G','L','ML','M','CX','PCT'];
export function productFromRow(row) {
 return {_id:row.id,codigoProduto:row.codigo_produto,nome:row.nome,codigoBarras:row.codigo_barras??'',categoria:row.categoria??'',unidade:row.unidade,custo:Number(row.custo),precoVenda:Number(row.preco_venda),observacoes:row.observacoes??'',ativo:row.ativo,createdAt:row.created_at,updatedAt:row.updated_at,componentes:row.componentes??[]};
}

export function stockQuantity(value,allowZero=false){
 const text=String(value).trim().replace(',','.'),number=Number(text);
 if(!/^\d+(\.\d{1,3})?$/.test(text)||!Number.isFinite(number)||number>999999999999.999||(!allowZero&&number===0))throw new Error('Quantidade inválida. Use até três casas decimais.');
 return number;
}
export function stockFromRow(row){return {_id:row.id,codigoInsumo:row.codigo_insumo,nome:row.nome,unidade:row.unidade,saldo:Number(row.saldo),estoqueMinimo:row.estoque_minimo==null?null:Number(row.estoque_minimo),bloquearEstoqueNegativo:row.bloquear_estoque_negativo??false,observacoes:row.observacoes??'',ativo:row.ativo};}
export function stockToRow(body,editing=false){
 const row={};
 if(body.nome!==undefined){row.nome=String(body.nome).trim();if(!row.nome||row.nome.length>200)throw new Error('Informe o nome do item de estoque.');}
 if(!editing&&body.unidade!==undefined){if(!productUnits.includes(body.unidade))throw new Error('Unidade inválida.');row.unidade=body.unidade;}
 if(body.estoqueMinimo!==undefined)row.estoque_minimo=body.estoqueMinimo===null||String(body.estoqueMinimo).trim()===''?null:stockQuantity(body.estoqueMinimo,true);
 if(body.bloquearEstoqueNegativo!==undefined)row.bloquear_estoque_negativo=boolean(body.bloquearEstoqueNegativo);
 if(body.observacoes!==undefined)row.observacoes=String(body.observacoes).trim();
 if(body.ativo!==undefined)row.ativo=boolean(body.ativo);
 return row;
}
export function componentsToRows(components){
 if(!Array.isArray(components))throw new Error('Composição inválida.');
 const ids=new Set();
 return components.map(c=>{
  if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(c.stock_item_id)||ids.has(c.stock_item_id.toLowerCase()))throw new Error('Selecione cada item de estoque apenas uma vez.');
  ids.add(c.stock_item_id.toLowerCase());
  return {stock_item_id:c.stock_item_id,quantidade:stockQuantity(c.quantidade)};
 });
}
export function productToRow(body) {
 const row={};
 for(const key of ['nome','categoria','observacoes']) if(body[key]!==undefined)row[key]=String(body[key]).trim();
 if(row.nome!==undefined&&(!row.nome||row.nome.length>200))throw new Error('Informe um nome de até 200 caracteres.');
 if(body.codigoBarras!==undefined){
  if(body.codigoBarras!==null&&typeof body.codigoBarras!=='string')throw new Error('Informe o código de barras como texto.');
  row.codigo_barras=body.codigoBarras?.trim()||null;
  if(row.codigo_barras?.length>64)throw new Error('O código de barras deve ter até 64 caracteres.');
 }
 if(body.unidade!==undefined){
  if(!productUnits.includes(body.unidade))throw new Error('Unidade inválida.');
  row.unidade=body.unidade;
 }
 for(const [field,column,label] of [['custo','custo','Custo'],['precoVenda','preco_venda','Preço de venda']]){
  if(body[field]===undefined)continue;
  const text=String(body[field]).trim().replace(',','.');
  const number=Number(text);
  if(!/^\d+(\.\d{1,2})?$/.test(text)||!Number.isFinite(number)||number>9999999999.99)throw new Error(label+' inválido. Use um valor positivo ou zero, com até duas casas decimais.');
  row[column]=number;
 }
 if(body.ativo!==undefined)row.ativo=boolean(body.ativo);
 return row;
}
