# Correção de codificação — 10/10/2026

A interface e os arquivos-fonte já usam UTF-8. A corrupção ocorreu ao ler SQL UTF-8 com a codificação padrão do Windows PowerShell e enviar o texto interpretado incorretamente ao banco.

Corrigidos no desenvolvimento `klrnvnzhzmazuaawxele`:

- Nomes de Boleto bancário, Cartão de crédito, Cartão de débito e Transferência bancária.
- Mensagens de nove funções de aplicação afetadas pela mesma leitura.
- Texto “Registro não encontrado” no tratamento de erros da API.

A migration `20261010210708_repair_utf8_text.sql` preserva IDs, vínculos, valores, configurações, payloads, proprietários e permissões. Os literais corretivos usam escapes Unicode em SQL ASCII para evitar repetir o erro durante a leitura. Arquivos de migrations anteriores permanecem inalterados.

Prevenção:

- `.editorconfig` especifica UTF-8.
- `AGENTS.md` exige leitura/escrita explícita em UTF-8, especialmente `Get-Content -Raw -Encoding UTF8` no PowerShell.
- `npm.cmd run check:encoding` verifica bytes UTF-8 e sequências corrompidas nos fontes, SQL e ferramentas; executa automaticamente antes do build.
- XML continua respeitando a codificação declarada no documento; não foi feita conversão indiscriminada de notas ou de dados dos clientes.

Validação: 138 arquivos aprovados na checagem, três testes do verificador aprovados, build aprovado, SQL de nomes/mensagens/permissões aprovado e regressão financeira aprovada com rollback. Advisors mantêm os avisos preexistentes; nenhuma alteração de permissão foi introduzida. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

Sem commit, push ou publicação do frontend nesta etapa. Atualizar a tela consulta novamente os cadastros corrigidos no banco.
