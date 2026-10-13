# Cadastro de fornecedores — V2

Implementado em 09/10/2026 na branch `v2`.

- Menu Cadastros > Fornecedores e rota protegida /fornecedores.
- Lista com busca por nome, fantasia, documento, código ou contato; filtros ativos/inativos; códigos mais recentes primeiro.
- Cadastro e edição em modal, proteção contra fechamento com alterações, estado de salvamento e preservação dos campos quando ocorre erro.
- Campos: nome/razão social obrigatório, nome fantasia, CPF/CNPJ, pessoa de contato, telefone, e-mail, endereço, observações e situação.
- API Supabase com lista paginada e lista explícita de campos editáveis.
- Tabela suppliers com código automático, UUID, timestamps, unicidade de documento ignorando pontuação/caixa e RLS. Documento é opcional; não é validado contra Receita Federal nem por dígitos verificadores.
- MASTER, ADMIN e OPERATOR ativos e autorizados podem consultar, cadastrar e editar. Anon e contas não autorizadas não acessam registros. Identificadores/timestamps não têm permissão de edição. Exclusão não tem permissão; usar inativação.
- Migração local: supabase/migrations/20261009044557_suppliers.sql, aplicada ao projeto de desenvolvimento klrnvnzhzmazuaawxele. Precisa ser reaplicada junto às migrações anteriores ao criar o banco do cliente.

## Validação
- Frontend: 46 testes em 10 arquivos passaram, incluindo busca/filtros/ordenação, cadastro com falha e nova tentativa, edição/inativação e proteção de campos na API.
- Compilação Vite passou. Aviso existente de bundle maior que 500 kB.
- supabase/tests/suppliers_security.sql executado no projeto de desenvolvimento: cadastro/leitura/edição autorizados; duplicidade, edição do código, exclusão, acesso anon e inserção sem autorização bloqueados. Transação revertida, sem fixtures persistidas; sequências podem ter lacunas após teste.
- Revisão Supabase: suppliers possui aviso de descoberta no esquema GraphQL por usuários autenticados, esperado pela concessão SELECT necessária ao aplicativo. Dados continuam protegidos por RLS e foram testados com conta não autorizada. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed
- Verificação visual em navegador não executada: ambiente sem navegador disponível.
- Sem alteração no Mongo do cliente, deploy, push ou commit automático.

## Próximas etapas
Vincular compras, estoque e contas a pagar. A estrutura atual segue o acesso compartilhado do sistema; separação de dados entre empresas exige implementar o vínculo com empresa e adaptar RLS antes de hospedar várias empresas no mesmo projeto.
