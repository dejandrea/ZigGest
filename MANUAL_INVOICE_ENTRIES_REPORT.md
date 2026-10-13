# Entrada de NF-e digitada — 10/10/2026

Na tela Entrada por NF-e, **Forma de entrada → Digitar nota manualmente** permite registrar a nota sem XML nem chave de acesso.

Campos obrigatórios: número (até 9 dígitos), série (até 3), razão social e CPF/CNPJ do fornecedor, emissão, total da nota e ao menos um item. Dados do destinatário e código do produto são opcionais. Cada item possui descrição, unidade/quantidade na nota, valores, quantidade recebida, fator de conversão e vínculo com insumo ativo. Totais são informados separadamente para acomodar descontos/frete; não são usados para valorar estoque.

É possível adicionar/remover itens, cadastrar insumos e fornecedores sem fechar a entrada, ajustar quantidades e informar chegada retroativa. Conversão: 2 pacotes × 12 unidades = 24 UN. Alternar o modo pede confirmação quando há dados preenchidos. Insumos recém-criados continuam disponíveis ao alternar.

Migração `20261010195716_manual_invoice_entries.sql` aplicada ao projeto de desenvolvimento `klrnvnzhzmazuaawxele`. Origem MANUAL preservada, chave/XML ausentes, sem geração de documento fiscal artificial. Histórico mostra a origem e não oferece download de XML para notas sem arquivo.

A RPC pública SECURITY INVOKER chama função privada com autorização validada e search_path vazio. Cabeçalho, linhas, saldos e histórico são gravados atomicamente; falhas revertem tudo. Locks de pedido e de insumos, UUID para repetição segura, RLS e proteção contra edição direta permanecem. Identificação única por fornecedor+número+série, normalizando zeros iniciais, impede duplicar a mesma nota entre entradas manuais ou XML. Notas existentes precisam ter identidades únicas antes de aplicar o índice em outro projeto.

Validação SQL em transações revertidas: registro sem XML/chave, 2×12=24, repetição sem duplicação, recusa de identidade repetida e pedido alterado, rollback para insumo inativo, data futura recusada e bloqueio de acesso não autorizado/anônimo. Testes SQL anteriores de importação por XML também passaram. Build Vite passou. Advisors mantêm os avisos anteriores de descoberta GraphQL, autenticação e administração.

Testes frontend cobrem digitação sem XML/chave, conversão, adicionar/remover itens, normalização/validação do payload e histórico manual sem XML. Na execução da suíte completa, 99 testes passaram e um teste de atualização de permissões em AuthContext falhou; o código de autenticação não foi alterado nesta etapa. Na verificação direcionada, os 17 testes dos fluxos de notas e autenticação passaram; a falha não se reproduziu nessa execução.

Entrada manual controla estoque e preserva os dados digitados; não valida situação fiscal na SEFAZ, gera NF-e, cria contas a pagar ou calcula custo médio. Sem deploy do frontend, novo commit ou push.
