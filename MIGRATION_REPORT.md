# Relatório — preparação e validação MongoDB → Supabase

Data: 07/10/2026. Origem autorizada pelo proprietário: `MONGODB_URI` em `backend/.env`, banco `AppDistribuidora`. Destino confirmado: `ninjaDistribuidora`, projeto `klrnvnzhzmazuaawxele`.

## Resultado

Os dados já estavam presentes no Supabase antes deste trabalho. Foram comparados os campos de negócio dos 14 registros com a origem; todos coincidem. Não foi necessário inserir, atualizar ou excluir registros. O trabalho concluiu instalações, exportações privadas, reconciliação e proteção do acesso ao destino.

| Origem MongoDB | Destino Supabase | Origem | Destino | Diferenças |
| --- | --- | ---: | ---: | ---: |
| clientes | customers | 5 | 5 | 0 |
| usuarios | users | 4 | 4 | 0 |
| contas | customer_ledger | 5 | 5 | 0 |
| mesas | Ainda sem tabela correspondente neste modelo | 0 | — | Sem documentos para transferir |
| itemmesas | Ainda sem tabela correspondente neste modelo | 0 | — | Sem documentos para transferir |
| counters | Metadados e sequências, preservados na exportação | 3 | — | Não são registros de negócio |

Conferência financeira: débitos **R$ 325,00**, créditos **R$ 1,00**, saldo **R$ 324,00**. Nenhum lançamento órfão ou código de conta duplicado foi identificado. As sequências PostgreSQL de clientes e contas têm próximo valor 6, acima dos códigos existentes (máximo 5).

A indicação de que esta é a base real do cliente veio do proprietário. A conexão executada foi exclusivamente a configurada em `backend/.env`; não houve seleção de outro cluster ou banco. As contagens acima permitem conferir se essa configuração corresponde ao conjunto de dados esperado.

## Ferramentas instaladas

Pacote isolado em `tools/data-migration`, sem acrescentar dependências de migração ao frontend ou backend:

- Driver MongoDB e BSON/EJSON para exportação consistente.
- Cliente Supabase para comparação pela API.
- dotenv para configuração privada.
- decimal.js para valores financeiros sem arredondamento adicional.
- pg disponível para uma eventual operação PostgreSQL transacional; não foi utilizado neste trabalho e nenhuma senha de conexão PostgreSQL foi solicitada.

Dependências resolvidas estão fixadas no package.json e package-lock.json. Não foi instalado mongodump: o artefato produzido é uma exportação lógica EJSON, não um dump nativo completo com índices, permissões e configuração do cluster.

## Exportações e integridade

Foram feitos dois snapshots somente de leitura do MongoDB, usando sessão com leitura snapshot. Todas as coleções não sistêmicas encontradas foram exportadas, incluindo counters e coleções vazias. As coleções têm checksums SHA-256; os dois snapshots são iguais.

Antes da proteção de acesso, os registros existentes de customers, users, customer_ledger e teste_conexao foram exportados privadamente. Arquivos e checksums estão em `.migration-private/`, ignorada pelo Git. Esses arquivos contêm dados pessoais e hashes de senha: não devem ser publicados, enviados para o frontend ou compartilhados em canais públicos. Ignore no Git não equivale a criptografia em disco.

A validação final administrativa comparou fingerprints SHA-256 de linhas normalizadas, gerados a partir do segundo snapshot e das tabelas reais no PostgreSQL: **14 esperados, 14 encontrados, zero ausentes/alterados e zero adicionais**. Campos financeiros, datas, identificação de negócio e hashes de senha foram incluídos sem mostrar valores pessoais ou credenciais nos logs.

MongoDB _id, __v e counters continuam disponíveis no EJSON. O modelo customers identifica clientes por codigo_cliente e UUID; não foi criado um campo adicional para MongoDB _id. Os IDs MongoDB de contas e usuários já são preservados em mongo_oid. As funções não inventam permissões administrativas para usuários.

## Segurança encontrada e corrigida

1. customers, users e customer_ledger estavam com RLS desativado e acessíveis pelo perfil público. RLS foi ativado nas três tabelas.
2. A view v_customer_balance executava com privilégios do proprietário e poderia contornar RLS. Foi configurada com security_invoker=true.
3. Revogados os privilégios de anon sobre clientes, lançamentos e a view de saldos. Revogados os privilégios de anon e authenticated sobre public.users, que contém hashes de senha.
4. O valor denominado SUPABASE_SERVICE_ROLE_KEY em arquivos locais era, na realidade, uma chave anon. O nome foi corrigido para SUPABASE_ANON_KEY em backend/.env, .env e frontend/.env, sem imprimir ou trocar o valor.
5. A ferramenta local de comparação agora rejeita chave pública ou ausência de chave administrativa. Após ativar RLS, uma consulta pública retorna zero linhas; isso não significa que a tabela esteja vazia. A validação final usou o conector administrativo e confirmou que todos os registros permanecem presentes.

SQL aplicado está em `tools/data-migration/harden-target.sql`. Não foram alterados senhas de usuários, roles existentes, dados do MongoDB ou registros de negócio do Supabase.

RLS está deliberadamente sem políticas de acesso para a V2 neste momento. Isso bloqueia o CRUD direto pelo navegador até implementarmos Auth e as regras de autorização. Não criar uma política aberta para resolver esse bloqueio. A aplicação atual do cliente continua usando MongoDB; nenhum deploy ou troca de conexão dela foi executado.

## Testes e verificações

- Cinco testes locais com dados fictícios: **5 passaram**. Cobrem valores decimais, rejeição de lançamentos inválidos, códigos, datas e rejeição de senha em texto puro.
- Checksums dos dois snapshots MongoDB: iguais.
- Reconciliação inicial pela API: os 14 registros já existiam e eram iguais.
- Reconciliação final administrativa por fingerprints: zero divergências.
- Totais e contagens PostgreSQL: conferem com MongoDB.
- Teste SQL com perfil anon após ativar RLS: zero registros visíveis nas três tabelas. Após revogação, privilégios de leitura pública confirmados como falsos.
- Teste SQL com perfil authenticated após a correção da view: zero clientes, lançamentos e saldos visíveis; leitura de users não permitida.
- Arquivos de ambiente e exportações privadas: proteção Git confirmada.
- Verificação de sintaxe dos scripts e git diff --check: sem erros relevantes.
- O frontend não foi modificado por esta etapa. Seu build e dois testes passaram na etapa anterior com Vite.

## Pendências e limites

- Os quatro registros em public.users **não são contas do Supabase Auth**. auth.users está vazio. Ainda precisamos implementar o controle de usuários e definir como provisionar/resetar credenciais; hashes atuais foram apenas preservados, sem exposição ao frontend.
- Implementar as políticas de autorização da V2, adaptar CRUDs e funções, criar o esquema necessário de mesas/itens e definir integridade referencial entre lançamentos e clientes. Hoje não há lançamentos órfãos, mas o modelo não possui a chave estrangeira correspondente.
- Não foi implementada sincronização contínua. Novas operações do cliente no MongoDB após o snapshot exigem outra reconciliação antes da troca definitiva.
- Antes do corte, preparar a janela de transição, backup operacional apropriado, conferência final e plano de retorno. Nada foi desligado no Render.
- A senha MongoDB identificada no incidente anterior continua exigindo rotação no Atlas. Não houve rotação ou limpeza do histórico Git.
- Como as tabelas estavam anteriormente públicas, não é possível excluir acesso indevido anterior. Revisar atividade e avaliar troca das credenciais de usuários de aplicação.
- A tabela de teste teste_conexao e suas políticas abertas não foram alteradas; não contém dados migrados. Sua remoção/proteção deverá ser tratada na preparação do ambiente de produção.
- O projeto usado nesta etapa é o informado pelo proprietário. A criação de um projeto definitivo na conta do cliente permanece uma etapa posterior conforme o plano anterior.

## Arquivos de trabalho

- inspect-source.mjs: exportação MongoDB somente de leitura.
- transform.mjs: transformação e comparação dos campos.
- compare-target.mjs: exportação/comparação pela API, condicionada a credencial administrativa.
- verify-fingerprints.mjs: produz SQL de conferência usando somente fingerprints, sem imprimir dados pessoais ou senhas.
- transform.test.mjs: testes fictícios.
- harden-target.sql: proteção de acesso aplicada.
- README.md: uso e limites das ferramentas.

Não existe rotina automática de exclusão, sobrescrita de dados ou deploy nesses arquivos. Nenhum commit, push ou reescrita de histórico foi realizado.
