export const navigationGroups = [
  { title:'Cadastros', items:[{label:'Clientes',path:'/clientes',icon:'clients'},{label:'Fornecedores',path:'/fornecedores',icon:'clients'},{label:'Produtos',icon:'box'}] },
  { title:'Financeiro', items:[{label:'A receber',path:'/contas',icon:'money'},{label:'A pagar',icon:'money'},{label:'Movimentações',icon:'report'},{label:'Resumo de contas',path:'/resumo',icon:'report'}] },
  { title:'Estoque', items:[{label:'Visão do estoque',icon:'box'},{label:'Entradas e saídas',icon:'box'},{label:'Inventário',icon:'report'}] },
  { title:'Frente de loja', items:[{label:'PDV',icon:'money'},{label:'Caixa',icon:'money'},{label:'Mesas',path:'/mesas',icon:'table'}] },
  { title:'Administração', admin:true, items:[{label:'Usuários',path:'/usuarios',icon:'users'}] },
];
export function navigationTitle(path) {
  for(const group of navigationGroups) {
    const item=group.items.find(item=>item.path===path);
    if(item) return group.title+' / '+item.label;
  }
  return 'Visão geral';
}
