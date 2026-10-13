# Auditoria de segurança - 07/10/2026

## 1. Vulnerabilidades

Crítica: `migrarDados/script.js` continha URI MongoDB autenticada nas linhas originais 6 (comentada) e 22 (ativa). Tratar como comprometida, conforme incidente GitGuardian informado pelo proprietário; não foi testada a validade.

Alta: a mesma URI foi encontrada nos arquivos privados `.env`, `backend/.env` e `api/.env`, linhas 2 (comentada) e 3 (ativa). Isso indica reutilização entre migração e configuração do backend. Não confirma qual implantação ? produção.

Alta: `backend/server.js` e `backend/routes/usuarioRoutes.js` expõem rotas sem middleware de autenticação visível; `backend/routes/clienteRoutes.js` também não verifica sessão. A proteção em `frontend/src/App.js` depende de localStorage e não protege a API. `backend/controllers/usuarioController.js` retorna documentos completos, incluindo hashes de senha em listagens, criação, atualização e login. Esses problemas exigem correção funcional separada.

Média: o backend registrava o objeto completo de erro de conexão MongoDB, potencialmente incluindo detalhes sensíveis. Corrigido para mensagem fixa.

Configurações locais contém `SUPABASE_SERVICE_ROLE_KEY`, inclusive em `frontend/.env`. Não há evidência de exposição dessas chaves no histórico local examinado. Remover a cópia desnecessária do frontend e verificar artefatos/logs. A variável não tem prefixo REACT_APP_; sua presença nesse arquivo não prova inclusão no bundle. Uma chave administrativa pode ignorar RLS e deve permanecer no servidor: [documentação Supabase](https://supabase.com/docs/guides/getting-started/api-keys).

Não foram encontrados tokens GitHub, identificadores AWS ou chaves privadas nos padrões examinados no diretório fonte. Não foram identificadas configurações explícitas de desativação de TLS. Permissões reais do usuário MongoDB e a lista de IPs do Atlas não são verificáveis pelo código disponível; não afirmar que há acesso 0.0.0.0/0 ou privilégios administrativos sem examinar o painel.

## 2. Arquivos e commits afetados

Foram examinados os 37 commits alcançáveis pelas referências locais, inclusive referências remotas locais. Não foi feito fetch; isso não cobre necessariamente todas as referências atuais do GitHub, forks, PRs, reflogs e objetos inalcançáveis.

- `501537bfb1d30b355318b16229e68c01b07d15c4`: 31/07/2025, 18:56:22 UTC-03; adição original identificada do script com credencial.
- `cb42ae912ce3995a00fe3ee40da897309440720a`: 31/07/2025, 18:57:58 UTC-03; snapshot ainda contém a credencial.
- `8ca9968`: 31/07/2025; remoção do script, sem limpar os commits anteriores.

Evidências sem segredos: `security-history-findings.json`. Nenhum arquivo .env está rastreado atualmente ou foi encontrado no histórico local consultado. A pasta migrarDados já estava fora do HEAD, mas ainda existia no disco.

## 3. Alterações realizadas

- Removida integralmente a pasta local `migrarDados`, por instrução explícita do proprietário, sem executar seu conteúdo.
- Mantida regra `migrarDados/` no `.gitignore`; incluída proteção geral `.env.*`, exceções para exemplos e regras para `*.pem` e `*.key`.
- Criado `.env.example` com conexão local e valores fictícios.
- Preservado uso de `process.env.MONGODB_URI` em `backend/server.js`; log de falha agora usa mensagem fixa sem objeto de erro.
- Preservadas alterações locais preexistentes em outros arquivos. Nenhum commit ou push realizado.

A troca preliminar da URI do script por variável de ambiente não faz parte do resultado final porque a pasta foi excluída conforme a nova instrução. A migração deixa de estar disponível localmente. Os arquivos privados .env foram preservados e ainda contém configurações antigas até a atualização manual.

## 4. Rotação e consumidores

Obrigatória: rotacionar a senha do usuário MongoDB exposto e qualquer reutilização da mesma senha. Essa ? a identidade de banco, distinta da conta de acesso ao painel Atlas. Se não houver uso legítimo, revogar o usuário após revisar consumidores.

Atualizar MONGODB_URI no backend (`backend/server.js`), nos arquivos privados da raiz, backend e api, no gerenciador de segredos dos serviços de hospedagem/CI e em ferramentas administrativas que utilizem o usuário. Remover também cópias comentadas antigas. A URI em api/.env comprova cópia de configuração, não consumo MongoDB pelo código atual de api. A migração foi removida; uma futura migração deve usar usuário separado e variável de ambiente.

As chaves Supabase administrativas locais não têm exposição Git comprovada. Rotacionar se aparecerem em artefatos públicos, logs ou compartilhamentos; não rotacionar a chave pública anon apenas por sua utilização no frontend.

## 5. Procedimento manual no Atlas

1. No projeto correto, abrir Database & Network Access, localizar o usuário do incidente e editar a senha. Gerar senha forte exclusiva e guardar em gerenciador de segredos. Alternativamente criar identidade substituta e revogar a antiga após a troca, com janela curta.
2. Revisar funções e escopo: permitir apenas operações e bancos necessários, evitando administração e acesso a todos os bancos sem justificativa. Separar identidades de aplicação e migração.
3. Obter modelo em Connect > Drivers; aplicar nova senha/usuário, preservando banco e opções necessários. Usar percent-encoding para caracteres reservados da senha na URI. Não registrar a URI em comandos, tickets ou commits.
4. Atualizar os consumidores e reiniciar/deployar somente com autorização operacional. Verificar funcionamento e revogação em validação autorizada separada.
5. Revisar Network Access; restringir aos IPs de saída necessários ou conectividade privada. Se existir 0.0.0.0/0, planejar sua remoção sem interromper consumidores legítimos. Revisar logs e atividade disponíveis desde a exposição; ausência de registro não prova ausência de acesso indevido.

Fontes: [usuários Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/) e [lista de IPs Atlas](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## 6. Limpeza do histórico e riscos remanescentes

Rotacionar primeiro. Exclusão e gitignore não revogam senhas nem apagam snapshots. Coordenar congelamento de pushes e cópia privada de recuperação (também contém o segredo). Trabalhar em clone limpo separado, nunca neste diretório com alterações pendentes.

Após autorização, usar versão atual de git-filter-repo em clone espelho do remoto:

```text
git filter-repo --sensitive-data-removal --invert-paths --path migrarDados/
```

Incluir eventuais nomes antigos da pasta. Verificar todas as referências com saída redigida, revisar o que será publicado e obter autorização explícita antes de push forçado. Coordenar novos clones para evitar reintrodução. Solicitar remoção de caches/referências de PRs ao GitHub quando aplicável. Forks e cópias de terceiros permanecem fora do controle do proprietário. Procedimento: [documentação GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

A credencial antiga nos arquivos locais e commits permanece um risco até revogação. A análise por padrões não garante ausência de segredos codificados/fragmentados. Não houve auditoria de dependências ou confirmação da configuração da produção.

## 7. Testes e validação

- `node --check backend/server.js`: passou, sem executar o servidor.
- `node --check migrarDados/script.js`: passou na versão preliminar, antes da exclusão; não representa um arquivo presente no resultado final.
- `git check-ignore`: confirmou proteção da pasta migrarDados e dos ambientes privados; .env.example não está ignorado.
- Confirmação local: pasta migrarDados inexistente.
- `npm run build` em frontend: passou (exit 0), com avisos de variáveis/importações não utilizados, dependência de hook, Browserslist antigo e APIs Webpack obsoletas.
- Busca exata das URIs e chaves administrativas locais nos artefatos gerados: nenhuma ocorrência encontrada; isso não cobre artefatos de outras implantações.
- `node --check` em 18 arquivos JavaScript do backend: 17 passaram; `backend/controllers/contaController.js:22` falhou com `Unexpected identifier observacoes`. Esse arquivo já estava modificado antes da auditoria e não foi alterado por esta tarefa. Não ? possível declarar o backend válido no estado local atual.
- Tentativas de executar Jest/React Scripts: sem resultado retornado pela ferramenta no período observado; execução não validada. O único App.test.js ainda procura o texto padrão learn react e não representa a interface atual. Nenhum teste de integração com banco foi executado.
- Busca adicional de padrões JWT, tokens GitHub, identificadores AWS e chaves privadas nos 37 commits: nenhuma ocorrência.
- `git diff --check` restrito aos arquivos rastreados alterados nesta auditoria: passou.

Nenhuma conexão ao banco, migração, escrita externa, alteração no Atlas, deploy ou reescrita Git foi executada.

## 8. Pendências e autorização

- Proprietário: rotacionar/revogar a credencial e atualizar consumidores; incidente não está resolvido enquanto a senha antiga for válida.
- Revisar funções, IPs e atividade no Atlas.
- Autorizar separadamente limpeza do histórico e publicação forçada após revisar o procedimento.
- Planejar correção de autenticação/autorização da API e remoção de hashes das respostas com testes de comportamento.
- Autorizar eventual reinício/deploy e verificação operacional após rotação.

## Atualizacao do contexto

O proprietario confirmou que o MongoDB configurado localmente e uma copia do banco do cliente. Nao houve conexao para verificar esse ambiente. A copia deve ser preservada e a credencial exposta continua exigindo rotacao.

## Reinicio autorizado da V2

Criado branch v2-restart a partir da main (a777b01), preservando main e v2. Backup local verificado em .local-recovery\20261007-162215/workspace.zip, protegido pelo gitignore; inclui arquivos privados e nao deve ser compartilhado. Alteracoes antigas foram descartadas dos fontes, preservando correcoes de seguranca e relatorio. Dependencias residuais bloqueadas por outro processo permanecem em sgs-v2/node_modules e a pasta esta ignorada. Nenhum dado externo foi alterado. Verificacao de sintaxe do backend restaurado: 12 arquivos, 0 falhas.

## Verificacao posterior de chaves Supabase

Na etapa de validacao MongoDB/Supabase foi confirmado que as chaves locais denominadas SUPABASE_SERVICE_ROLE_KEY eram chaves publicas anon, e nao chaves administrativas. Os nomes foram corrigidos. A auditoria inicial tinha identificado o risco pelo nome da variavel; esta verificacao esclarece a classificacao. O banco modelo estava com RLS desativado, expondo inclusive hashes de senha, e o acesso foi protegido conforme MIGRATION_REPORT.md.
