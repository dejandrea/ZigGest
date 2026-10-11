export const navigationGroups = [
  { title:'Cadastros', items:[{label:'Clientes',path:'/clientes',icon:'clients'},{label:'Fornecedores',path:'/fornecedores',icon:'clients'},{label:'Produtos',path:'/produtos',icon:'box'},{label:'Insumos / itens de estoque',path:'/insumos',icon:'box'}] },
  { title:'Financeiro', items:[{label:'A receber',path:'/contas',icon:'money'},{label:'A pagar',path:'/contas-pagar',icon:'money'},{label:'Movimentações',path:'/financeiro',icon:'report'},{label:'Resumo de contas',path:'/resumo',icon:'report'}] },
  { title:'Estoque', items:[{label:'Visão do estoque',path:'/estoque',icon:'box'},{label:'Entradas e saídas',path:'/estoque/movimentacoes',icon:'box'},{label:'Inventário',path:'/estoque/inventario',icon:'report'}] },
  { title:'Frente de loja', items:[{label:'PDV',icon:'money'},{label:'Caixa',path:'/caixa',icon:'money'},{label:'Comandas',path:'/comandas',icon:'table'}] },
  { title:'Relatórios', items:[{label:'Todos os relatórios',path:'/relatorios',icon:'report'},{label:'Financeiros',path:'/relatorios/financeiro',icon:'money'},{label:'Estoque',path:'/relatorios/estoque',icon:'box'},{label:'Registros de operações',path:'/relatorios/logs',icon:'report'},{label:'Vendas e notas fiscais',path:'/relatorios/vendas-notas',icon:'report'}] },
  { title:'Administração', admin:true, items:[{label:'Usuários',path:'/usuarios',icon:'users'},{label:'Configurações financeiras',path:'/financeiro/configuracoes',icon:'money'}] },
];
export function navigationTitle(path) {
  for(const group of navigationGroups) {
    const item=group.items.find(item=>item.path===path);
    if(item) return group.title+' / '+item.label;
  }
  return 'Visão geral';
}
