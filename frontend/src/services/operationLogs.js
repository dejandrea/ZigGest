export const logActions={INSERT:'Criação',UPDATE:'Alteração',DELETE:'Exclusão'};
export const logEntities={
 'public.customers':'Clientes','public.customer_ledger':'Contas a receber',
 'public.suppliers':'Fornecedores','public.invoice_recipients':'Destinatários',
 'public.products':'Produtos','public.stock_items':'Insumos','public.product_components':'Composição de produtos',
 'public.stock_item_suppliers':'Fornecedores dos insumos','public.stock_locations':'Locais de estoque',
 'public.stock_balances':'Saldos de estoque','public.stock_movements':'Movimentações de estoque',
 'public.stock_movement_lines':'Itens das movimentações','public.stock_invoices':'Notas de entrada',
 'public.stock_invoice_items':'Itens das notas','public.stock_inventories':'Inventários',
 'public.stock_inventory_lines':'Contagens do inventário','public.production_recipes':'Fichas de produção',
 'public.production_batches':'Lotes de produção','public.purchase_rounds':'Cotações',
 'public.supplier_payables':'Contas a pagar','public.supplier_payable_installments':'Parcelas a pagar',
 'public.financial_accounts':'Contas financeiras','public.financial_categories':'Categorias financeiras',
 'public.financial_payment_methods':'Formas de pagamento','public.financial_operations':'Operações financeiras',
 'public.financial_entries':'Lançamentos financeiros','public.cash_sessions':'Sessões de caixa',
 'public.cash_sales':'Vendas','public.cash_movements':'Movimentações de caixa',
 'public.dining_tables':'Comandas','public.dining_table_items':'Consumos das comandas',
 'public.comanda_closures':'Encerramentos das comandas','public.comanda_payments':'Pagamentos das comandas',
 'public.low_stock_alerts':'Alertas de estoque','public.users':'Usuários antigos',
 'app_private.account_directory':'Usuários',
};
const fields={nome:'Nome',apelido:'Apelido',amount:'Valor',valor:'Valor',entry_type:'Tipo',customer_codigo:'Código do cliente',
 codigo_conta:'Código do lançamento',codigo_cliente:'Código do cliente',ativo:'Ativo',status:'Situação',
 limite:'Limite',total_pendente:'Saldo Devedor',notes:'Observações',observacoes:'Observações',
 due_at:'Vencimento',issue_at:'Data do lançamento',descricao:'Descrição',custo:'Custo',preco_venda:'Preço de venda',
 saldo:'Saldo',quantidade:'Quantidade',nome_cliente:'Nome do cliente',role:'Perfil',enabled:'Ativo',email:'E-mail'};
export const logField=key=>fields[key]??key.replaceAll('_',' ');
export function logChanges(record){
 const before=record.before??{},after=record.after??{};
 return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>
  !['updated_at','created_at'].includes(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key])
 ).map(key=>({key,before:before[key],after:after[key]}));
}
export function logValue(value){
 if(value==null||value==='')return '—';
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(typeof value==='object')return JSON.stringify(value,null,2);
 return String(value);
}
