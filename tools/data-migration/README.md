# Ferramentas de migração

Execute nesta pasta ou use os caminhos a partir da raiz.

- `npm ci`: instala dependências fixadas no lockfile.
- `npm test`: testes locais fictícios.
- `npm run inspect`: lê MONGODB_URI de backend/.env e cria snapshot privado; faz conexão somente de leitura.
- `npm run compare`: exporta o destino e compara com o último snapshot; exige SUPABASE_SERVICE_ROLE_KEY administrativa de servidor. Nunca interpreta resposta filtrada por RLS como destino vazio.
- `npm run fingerprints`: gera SQL de comparação do snapshot com o projeto confirmado, sem incluir dados brutos.

Os snapshots e o SQL de fingerprints ficam em .migration-private, fora do Git. A execução do SQL deve ocorrer por conexão administrativa autorizada. A chave anon local não permite acesso aos dados protegidos.

Estas ferramentas **não executam importação, upsert, exclusão ou deploy**. Neste conjunto de dados, a importação já estava concluída: 14 registros iguais nos dois bancos. Um novo conjunto de dados exige revisão do plano, do esquema e da autenticação antes de adicionar uma etapa de escrita.

harden-target.sql: documenta RLS e privilégios aplicados ao destino. As políticas de uso da V2 ainda precisam ser implementadas.

Veja ../../MIGRATION_REPORT.md para o resultado e as pendências.
