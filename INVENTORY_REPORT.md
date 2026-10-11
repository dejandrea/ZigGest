# Inventário

Disponível em Estoque → Inventário, para contagem geral ou individual. A opção inicial inclui somente insumos ativos com saldo zero e sem movimentações. Insumos criados após a abertura entram em uma nova contagem.

Contagens ficam em rascunho no banco. Campo vazio significa não contado; zero é uma contagem válida. Operadores podem abrir, preencher e atualizar referências. Administradores confirmam ou cancelam. A confirmação gera ajuste no histórico, sem lançamento financeiro automático. Inventários encerrados não podem ser editados.

Cada confirmação bloqueia os insumos em ordem de ID e verifica saldo e data de alteração contra a referência. Mudanças exigem atualizar a referência e recontar os itens afetados. Revisões evitam que duas sessões sobrescrevam a mesma contagem. Repetir a confirmação não reaplica o ajuste.

## Verificação

- Testes SQL com rollback: inventário inicial, individual e geral; zero e itens não contados; confirmação repetida; histórico; revisão desatualizada; movimentação durante contagem; permissões e proteção contra escrita direta.
- Testes de interface e API: abertura inicial/individual, salvamento, revisão, confirmação, falha preservando a contagem e acesso de operadores.
- Build e verificação de UTF-8.

As novas tabelas usam RLS e permitem consultas apenas aos perfis habilitados do aplicativo. O advisor aponta a visibilidade de seus nomes no esquema GraphQL para usuários autenticados, como nas demais tabelas do projeto; a leitura dos dados segue as políticas verificadas pelos testes. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).

Migração aplicada apenas ao ambiente de desenvolvimento. Sem deploy, commit ou push nesta implementação.
