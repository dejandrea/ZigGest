# Ferramentas de migração

Execute nesta pasta ou use os caminhos a partir da raiz.

- `npm ci`: instala dependências fixadas no lockfile.
- `npm test`: testes locais fictícios.
- `npm run inspect`: lê MONGODB_URI de backend/.env e cria snapshot privado; faz conexão somente de leitura.
- `npm run compare`: exporta o destino e compara com o último snapshot; exige SUPABASE_SERVICE_ROLE_KEY administrativa de servidor. Nunca interpreta resposta filtrada por RLS como destino vazio.
- `npm run fingerprints`: gera SQL de comparação do snapshot com o projeto confirmado, sem incluir dados brutos.

Os snapshots e o SQL de fingerprints ficam em .migration-private, fora do Git. A execução do SQL deve ocorrer por conexão administrativa autorizada. A chave anon local não permite acesso aos dados protegidos.

As ferramentas de inspeção e comparação **não executam importação, upsert, exclusão ou deploy**. O relatório histórico de 07/10/2026 comparou 14 registros de outra origem. Não use aquelas contagens para a base real `NinjaDistribuidora` selecionada posteriormente.

## Preparar uma instalação nova da V2

Configure `SUPABASE_URL` e `SUPABASE_DB_URL` em `backend/.env`, fora do Git. Use uma conexão PostgreSQL administrativa do projeto de destino (conexão direta ou Session pooler). A chave pública não permite instalar o banco. Nunca copie essa configuração para o frontend.

```powershell
npm run prepare:target -- REFERENCIA_DO_PROJETO email-do-master@example.com
npm run verify:target -- REFERENCIA_DO_PROJETO
npm run test:target -- REFERENCIA_DO_PROJETO
```

- `prepare-target.mjs`: confere as duas conexões contra a referência explícita e recusa bancos com tabelas, sequências, views ou usuários Auth existentes. Cria a estrutura inicial vazia (`bootstrap-baseline.sql`), aplica todas as migrações em ordem e autoriza apenas o e-mail master informado. Remove o administrador de desenvolvimento sem cadastro que a primeira migração histórica adiciona. Tudo ocorre em uma transação: falhas revertem a instalação.
- Não copia registros do Supabase de desenvolvimento nem importa dados do MongoDB. Não cria senhas, contas Auth, demonstrações ou deploys. O master ainda precisa se cadastrar e confirmar seu e-mail.
- Registra o histórico em `supabase_migrations.schema_migrations` e checksums das fontes em `app_private.installation_manifest`. A estrutura inicial contém clientes, lançamentos e usuários legados, com acesso protegido desde a criação.
- `verify-target.mjs`: verifica os checksums, configurações iniciais e permissões de uma instalação ainda vazia. Confirma que usuários anônimos e contas sem autorização não têm acesso.
- `test-target.mjs`: executa 23 cenários de banco com fixtures temporárias e rollback. Recusa a execução depois da importação; restaura as sequências que o PostgreSQL não reverte com rollback. Não envia e-mails nem mantém usuários de teste.
- `update-target.mjs`: aplica novas migrações pendentes de instalações preparadas por esta ferramenta. Confere o histórico e recusa fontes alteradas ou migrações fora de ordem. Uso: `npm run update:target -- REFERENCIA_DO_PROJETO`. Não executar updates concorrentes por outras ferramentas.

Antes do corte, bloquear gravações na origem MongoDB, refazer o snapshot, importar e reconciliar registros, saldos, datas, códigos e sequências. A importação precisa preservar lançamentos históricos de clientes atualmente bloqueados/inativos sem tratá-los como novas vendas. A URL de login/recuperação no Auth e as variáveis Vite pertencem à preparação do deploy; não são trocadas por esses scripts.

Veja `TARGET_PREPARATION.md` para o resultado da nova instalação da empresa.

## Importação definitiva da origem MongoDB

Ferramentas adicionadas em 13/10/2026, após confirmação do bloqueio das gravações na origem:

```powershell
npm run inspect
npm run plan:import
npm run import:target -- REFERENCIA_DO_PROJETO --source-writes-blocked
npm run inspect
npm run verify:import -- REFERENCIA_DO_PROJETO
```

- `import-source.mjs` verifica a origem `NinjaDistribuidora`, as coleções, contagens, checksums, códigos, relacionamentos e precisão financeira. Recusa coleções sem mapeamento e comandas abertas; usuários legados exigem revisão separada de autenticação.
- O campo `totalPendente` da origem não era atualizado pelo backend legado: os saldos vinham da agregação das contas. A importação inicializa o cache da V2 usando a soma exata dos lançamentos e preserva o cache original em uma tabela interna. Situação e demais campos cadastrais são preservados.
- `import-target.mjs` exige destino preparado sem dados de negócio e confirmação explícita de bloqueio da origem. Carrega os registros em uma transação com locks, mantém FK/check constraints/RLS/auditoria e desativa temporariamente apenas os dois triggers incompatíveis com histórico de clientes bloqueados. Restaura os triggers e reconcilia todos os campos antes do commit.
- IDs MongoDB dos clientes, cache original e checksums do snapshot são rastreados em tabelas internas com RLS. IDs MongoDB dos lançamentos ficam no campo `mongo_oid`. Não transforma créditos históricos em recebimentos bancários nem inventa pagamentos ou contas Auth.
- Sequências respeitam os maiores códigos e os counters exportados. Uma repetição sobre destino já importado é recusada. Em erro com resultado de commit incerto, verificar o runId antes de tentar novamente.
- `verify-import.mjs` compara novamente os registros e o snapshot, os saldos por cliente, os vínculos MongoDB, as sequências e as proteções. Confere a leitura como master com uma fixture Auth revertida, sem envio de e-mail. Depois da importação, usar esta verificação em vez de `verify:target`/`test:target`, que exigem base vazia.

Backups EJSON e relatórios detalhados da importação ficam exclusivamente em `.migration-private/`, ignorada pelo Git. Nenhuma dessas etapas troca a configuração ou publica o frontend.

harden-target.sql: documenta RLS e privilégios aplicados ao destino. As políticas de uso da V2 ainda precisam ser implementadas.

Veja ../../MIGRATION_REPORT.md para o resultado e as pendências.
