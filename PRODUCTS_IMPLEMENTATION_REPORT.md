# Cadastro de produtos — V2

Implementado na branch `v2`, em 09/10/2026.

## Funcionalidades
- Menu Cadastros > Produtos, rota /produtos protegida pela autenticação existente.
- Lista, busca por nome/categoria/código interno/código de barras, filtros ativos/inativos e ordenação com cadastros recentes primeiro.
- Cadastro e edição em modal com proteção de alterações não salvas, bloqueio durante salvamento, mensagens de erro e preservação dos dados.
- Nome obrigatório, categoria opcional, unidade (UN, KG, G, L, ML, M, CX, PCT), custo, preço de venda, observações e situação.
- Código interno automático. Código de barras opcional, armazenado como texto para preservar zeros à esquerda. Campo vazio vira NULL; vários produtos sem código são permitidos. Quando informado, deve ser único, inclusive em produtos inativos, e ter até 64 caracteres. É possível retirar o código na edição.
- Não há validação de dígito verificador/GTIN ou geração de etiqueta. É um campo de identificação para futura integração com PDV.
- Valores não negativos, até duas casas decimais, validados no adaptador antes de criar a consulta.
- Inativação em lugar de exclusão, preservando o cadastro. Estoque compartilhado e movimentações foram implementados na etapa seguinte, documentada em INVENTORY_IMPLEMENTATION_REPORT.md. Compras e integração com PDV continuam para as próximas etapas.

## Banco e segurança
- Migração supabase/migrations/20261009045452_products.sql aplicada ao projeto de desenvolvimento klrnvnzhzmazuaawxele.
- Tabela products com RLS, índice único para código de barras, preços numeric(12,2), código interno automático e timestamps.
- MASTER, ADMIN e OPERATOR autorizados e ativos podem ler, cadastrar e editar; anon e usuários sem autorização não acessam os registros.
- Permissões por coluna impedem editar identificadores e timestamps. DELETE não está concedido.
- API usa lista explícita de campos; informações arbitrárias de estoque/código interno não são persistidas.
- O modelo segue o acesso compartilhado atual: isolamento entre várias empresas exige vínculo de empresa e atualização das políticas antes desse uso.
- Advisor registra a descoberta de products no esquema GraphQL para autenticados pela permissão SELECT necessária ao app. A descoberta não remove a proteção RLS, testada com usuário não autorizado. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

## Verificação
- Build Vite concluído. Permanece o aviso de bundle acima de 500 kB.
- supabase/tests/products_security.sql executado com fixtures em transação revertida: cadastro de vários produtos sem barras; edição de preço/status/código; preservação dos zeros; limpeza do código; bloqueio de duplicidade, preço negativo, alteração de código interno e exclusão; acesso anon e usuário não autorizado bloqueados.
- Fixtures não persistem. Sequências podem apresentar lacunas após rollback.
- Suíte frontend: 60 testes em 11 arquivos passaram, incluindo navegação, cadastro sem barras, zeros à esquerda, duplicidade, correção após erro, edição/inativação, preços inválidos e proteção de campos.
- Verificação visual em navegador não realizada; ambiente sem navegador disponível.
- Sem acesso ao Mongo do cliente, migração de dados, deploy, push ou commit automático.

## Reprodução no projeto do cliente
Aplicar as migrações anteriores de estrutura/autorização e esta nova migração; configurar as variáveis públicas Supabase do frontend para o projeto de destino. Dados de produtos devem ser importados em uma etapa própria validada.
