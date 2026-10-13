# Estoques e setores

O saldo anterior foi preservado no estoque principal. Cada insumo tem um saldo por local, e o saldo consolidado é a soma desses locais. Entradas manuais, NF-e manual e XML chegam ao principal; transferências registram a saída da origem e a entrada no destino na mesma transação, sem alterar o total.

Em Estoque → Visão do estoque, o botão **Estoques e setores** permite visualizar os locais e, para administradores, cadastrar, renomear e desativar setores. O principal permanece ativo. Setores com saldo, produtos ativos vinculados ou inventários abertos precisam ser revisados antes da desativação. O botão **Transferir estoque** também aparece em Entradas e saídas.

Cada produto tem um **Estoque de saída**, usando o principal por padrão. PDV e comandas usam esse setor para baixar todos os insumos da composição. O bloqueio opcional de saldo negativo considera o saldo local. Estornos e reaberturas devolvem as quantidades ao setor original da venda, mesmo após mudar o cadastro do produto.

Inventários podem cobrir todos os setores ou apenas um, mantendo as opções geral, individual por insumo e inicial. A contagem geral discrimina insumo e setor: cada linha tem sua própria quantidade física e ajuste. A opção inicial verifica saldo zero e ausência de histórico no setor, permitindo iniciar um setor novo para um insumo já movimentado no principal. Uma movimentação em outro setor não invalida a referência da contagem local.

Visão do estoque e relatório permitem consultar o consolidado ou um setor, inclusive localizar saldos negativos locais quando o total é positivo. O mínimo opcional permanece definido por insumo.

## Validação

- 193 testes em 38 arquivos passaram na suíte completa do frontend.
- Testes SQL com rollback: entradas manuais e XML, conversão 2 × 12, transferências e repetição segura, baixa local, bloqueio negativo, inventário inicial por setor, contagens geral e local, permissões, PDV, reabertura e devolução ao setor original.
- Build e verificação UTF-8 passaram. Permanece o aviso existente de tamanho do bundle.
- Migração `20261011053247_sector_stock_locations.sql` aplicada somente ao projeto de desenvolvimento `klrnvnzhzmazuaawxele`. Conferência dos dados existentes: zero divergências entre saldo consolidado e soma local.

As novas tabelas usam RLS para leitura pelos perfis do aplicativo e não aceitam alteração direta de saldos. Operações passam por funções com autenticação, autorização, bloqueios e logs. O advisor manteve as categorias anteriores; as duas tabelas novas aparecem na visibilidade de metadados GraphQL para usuários autenticados, com leitura protegida por RLS. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).

Sem deploy ou push nesta etapa.
