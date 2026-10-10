# Estoque flexível — 10/10/2026

Esta atualização substitui as regras de mínimo obrigatório e recusa universal de saldo negativo descritas no relatório inicial de estoque.

- Estoque mínimo opcional por insumo: campo vazio salva NULL e desativa alertas de reposição. Zero continua sendo um mínimo válido; configurações anteriores são preservadas.
- Bloqueio de saída com saldo negativo opcional por insumo, desativado por padrão. Uma composição com qualquer insumo bloqueado e insuficiente reverte a saída inteira.
- Saldo negativo permanece visível. Entradas podem regularizá-lo parcialmente mesmo com bloqueio ativado.
- Entrada permite informar data e hora de chegada passadas. Campo vazio usa o momento do lançamento. Datas futuras são recusadas no cliente e no banco.
- Histórico guarda a ocorrência e o registro separadamente. A lista e os snapshots de saldo seguem a ordem de registro; entradas retroativas não reescrevem baixas nem recalculam snapshots antigos.
- Data integra a identificação do pedido: repetir uma entrada é seguro, mas reutilizar o UUID com outra data é recusado.
- Migração aplicada ao projeto de desenvolvimento `klrnvnzhzmazuaawxele`. Banco sem insumos reais no início da atualização; testes executados em transações revertidas.

Validação: 74 testes frontend passaram; build Vite passou. Testes SQL de estoque compartilhado e estoque flexível passaram, incluindo baixa 0 → -5, entrada retroativa parcial -5 → -3, regularização para 7, bloqueio opcional, repetição segura, data futura recusada e proteção de saldo/histórico. Advisors não indicaram novos problemas específicos desta alteração; permanecem os avisos de descoberta GraphQL das tabelas autenticadas e avisos anteriores de autenticação/administração.

A baixa permanece manual por produto nesta etapa. Integração com vendas/PDV e lançamento estruturado de notas fiscais não estão implementados; o documento pode ser informado nas observações da entrada. Sem deploy do frontend ou novo commit.
