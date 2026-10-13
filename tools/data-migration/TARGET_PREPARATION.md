# ZigGest V2 — preparação da base da empresa

Data: 13/10/2026. Projeto de destino: `hkgqglynafkewcblvrmp`.

## Estrutura aplicada

- Instalação inicial vazia e 39 migrações versionadas, incluindo a proteção adicional das tabelas internas de autorização e auditoria.
- 36 tabelas públicas e 9 internas: clientes, financeiro, fornecedores, destinatários, itens, estoque por setor, notas/entradas, inventários, compras/cotações, produção, caixa, comandas, PDV, notificações e registros de operações.
- Conta caixa, Conta banco, estoque principal, sete formas de pagamento e categorias financeiras iniciais criadas.
- `dejandrea@gmail.com` autorizado como MASTER. Nenhuma senha ou conta Supabase Auth criada. O cadastro e a confirmação de e-mail ficam para a etapa de acesso.
- Histórico de migrações e checksums registrados. As ferramentas de instalação podem ser reutilizadas para outros projetos, com referência e e-mail master explícitos.

## Validação

- 23 cenários SQL passaram no destino, cobrindo estoque/inventário/produção, notas/custos, fornecedores/destinatários, compras, financeiro, contas padrão, caixa, comandas, PDV, pagamentos e notificações.
- Fixtures e usuários de teste revertidos; sequências restauradas.
- Todas as tabelas da aplicação com RLS. Nenhuma permissão de tabela para `anon`; hashes de usuários legados inacessíveis ao navegador.
- Funções SECURITY DEFINER com search_path explícito. Chamadas públicas anônimas bloqueadas; contas autenticadas sem perfil autorizado não têm acesso ao negócio.
- Migrações, configurações iniciais e ausência de dados importados conferidas após os testes.
- Auth por e-mail habilitado e confirmação obrigatória. O trigger de autorização permite cadastro apenas de e-mails autorizados no diretório interno.

## Próxima etapa

A base está pronta para receber os dados. Clientes, lançamentos e usuários legados continuam vazios. A origem MongoDB permanece intacta; o Supabase de desenvolvimento, a conexão do frontend e o deploy também não foram alterados.

Antes da importação definitiva: interromper gravações do backend antigo, criar novo snapshot consistente, importar os 248 clientes e 9.604 lançamentos (contagens da inspeção, sujeitas à reconferência), validar os saldos e ajustar as sequências. Depois configurar os endereços de Auth, acesso master e conexão do deploy. As ferramentas desta etapa não religam o projeto Vercel.

## Atualização após a importação — 13/10/2026

A etapa acima foi concluída depois da confirmação do bloqueio das gravações pelo proprietário. Foram importados os clientes e lançamentos financeiros da origem real; os números permaneceram iguais à inspeção. Nenhum usuário legado ou comanda aberta existia no snapshot. O destino já não está vazio.

A migração 40 adicionou o rastreamento interno da importação e dos IDs MongoDB dos clientes. Todos os campos importados foram reconciliados antes do commit e novamente após a importação. Uma segunda exportação confirmou que a origem não mudou durante o processo. Os saldos da V2 foram calculados pelos lançamentos; o campo de cache zerado da origem foi preservado separadamente.

Sequências, integridade referencial, RLS, restauração dos triggers e acesso master verificados. Os relatórios financeiros detalhados e os backups ficam em `.migration-private/`, fora do Git. O MongoDB, a base de desenvolvimento e o deploy permaneceram sem alterações. Ainda é necessário configurar o acesso real do master, URLs de autenticação e o deploy da V2 para a nova base.
