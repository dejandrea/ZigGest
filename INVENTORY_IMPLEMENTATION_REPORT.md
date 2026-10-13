# Estoque compartilhado e insumos — V2

Implementado na branch `v2`, em 09/10/2026. Migração local `supabase/migrations/20261009051915_shared_inventory.sql` aplicada ao projeto de desenvolvimento `klrnvnzhzmazuaawxele`. Não altera o banco Mongo do cliente.

## Uso
1. Em Cadastros → Insumos / itens de estoque, cadastrar “Coca-Cola lata”, unidade UN. O saldo inicial é zero.
2. Em Cadastros → Produtos, criar/editar o produto unitário com preço próprio e composição “Coca-Cola lata: 1”.
3. Criar/editar o produto pack com preço próprio e composição “Coca-Cola lata: 12”. Cada produto mantém seu código de barras opcional.
4. Registrar a entrada do insumo com 12 embalagens e 12 unidades por embalagem. O saldo aumenta em 144 UN.
5. Em Estoque → Entradas e saídas, registrar saída de 2 produtos unitários e 1 pack. O saldo fica em 130 UN.

Não foram criados os cadastros reais deste exemplo; as fixtures de verificação foram revertidas.

## Funcionalidades
- Cadastro/edição/inativação de insumos, unidade base, estoque mínimo e observações; busca, filtros e alerta no mínimo ou abaixo.
- Visão do estoque com saldo na unidade base. A unidade não pode ser alterada após criação, preservando vínculos e histórico.
- Composição dos produtos com um ou vários insumos e consumo por uma unidade vendida. Produtos diferentes podem usar o mesmo insumo.
- Produto e composição são salvos na mesma transação. Composição inválida não deixa alteração parcial do produto.
- Entrada por quantidade de embalagens e fator de conversão, com prévia da quantidade na unidade base.
- Saída manual por produto, consumindo todos os seus insumos. Falta de qualquer insumo reverte toda a movimentação.
- Histórico preservado com tipo, referência, quantidade/fator informados, observações, itens consumidos e saldo após a movimentação.
- Produtos antigos sem composição continuam cadastrados. É necessário configurar a composição para registrar saída de estoque.
- Não foi alterado qualquer saldo real nem feita associação automática de produtos existentes.

## Banco e proteção
Tabelas `stock_items`, `product_components`, `stock_movements` e `stock_movement_lines`, todas com RLS.
- Acesso para MASTER, ADMIN e OPERATOR aprovados/ativos. Anon e contas sem autorização não acessam os registros nem as RPCs.
- Saldo e unidade não têm permissão de edição direta; histórico não pode ser inserido/editado/excluído diretamente pelo frontend.
- As funções privilegiadas ficam no schema privado, com autorização validada a cada chamada e search_path vazio. Os endpoints públicos são wrappers SECURITY INVOKER e têm EXECUTE restrito.
- Movimentações bloqueiam os itens afetados em ordem consistente e recusam saldo negativo. Produto também é bloqueado para impedir mudança da composição durante a baixa.
- Um UUID identifica cada pedido de movimentação. Repetir o mesmo pedido, pelo mesmo usuário e com os mesmos dados, retorna o registro existente sem duplicar estoque. Reutilizar o UUID com outro conteúdo é recusado.
- Consumos, quantidades e conversões usam precisão de até três casas decimais. Quantidades inválidas e itens/produtos inativos são recusados.
- Índices nas relações e nas datas; os registros das linhas guardam nome/unidade e quantidade consumida para que edições futuras não alterem o histórico.
- O acesso segue o modelo compartilhado atual. Hospedar várias empresas no mesmo projeto ainda exige vínculo com empresa e políticas de isolamento.

## Validação
- Build Vite passou; permanece o aviso de bundle acima de 500 kB.
- Suíte frontend: 70 testes em 13 arquivos passaram, incluindo cadastro/filtros de insumos, unidade fixa, conversão de packs, repetição segura, composição de produtos, saída manual, proteção de campos e funcionalidades anteriores.
- `supabase/tests/shared_inventory_security.sql`: exemplo 144 → 130; repetição segura; recusa de UUID com dados alterados; rollback com insumo insuficiente; composição/produto atômicos; bloqueio de saldo/unidade diretos, exclusão do histórico, item inativo e conta sem autorização; anon bloqueado.
- Testes SQL em transação revertida, sem fixtures persistidas. As sequências podem ter lacunas após rollback.
- Privilégios confirmados por consulta: saldo_editavel=false, unidade_editavel=false, historico_apagavel=false.
- Advisors: descoberta das novas tabelas no esquema GraphQL para autenticados é consequência da permissão SELECT usada pelo aplicativo. RLS continua restringindo dados e foi testada. [Referência](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).
- Índices novos aparecem sem utilização devido ao banco ainda sem movimentação real; foram mantidos por cobrirem relações e consultas futuras. [Referência](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Não foi executado teste de concorrência entre conexões distintas; a proteção usa locks transacionais do PostgreSQL e foi revista no SQL.
- Verificação visual em navegador não realizada; ambiente sem navegador disponível.

## Limites desta etapa
- Saída manual movimenta apenas estoque. Não gera venda, pagamento, conta a receber/pagar nem baixa automática em mesas/PDV.
- Sem controle de packs fechados versus avulsos, lotes, validade, locais, perdas, devoluções ou estornos.
- Estoque controla quantidades; valoração, custo médio e vínculo com compras/fornecedor são etapas futuras. Os custos/preços do cadastro de produtos permanecem preservados.
- Registros não são apagados nem reescritos. Eventuais correções operacionais precisarão de fluxo de ajuste/estorno.
- Sem migração de dados de produção, deploy, push ou commit automático.

## Novo projeto do cliente
Aplicar as migrações anteriores e esta migração. Criar/importar os insumos e configurar as composições antes de carregar o saldo inicial por movimentação auditada. A importação real requer validação própria e planejamento para não duplicar entradas.
