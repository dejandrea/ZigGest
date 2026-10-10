# Base financeira para caixa e PDV

Implementada em 10/10/2026. Escopo confirmado: contas financeiras, categorias, formas de pagamento, baixas parciais/totais, transferências e estornos. Abertura/fechamento de caixa e PDV ficam para a próxima etapa.

## Onde usar

- Administração → Configurações financeiras (`/financeiro/configuracoes`): contas, categorias e formas de pagamento. Somente MASTER/ADMIN.
- Financeiro → Movimentações (`/financeiro`): saldos, extrato, entradas/saídas avulsas, transferências e estornos.
- Financeiro → A pagar: pagar parcelas parcialmente ou por inteiro, consultar pago/saldo aberto e filtrar pagas, em aberto, vencidas e a vencer.
- Financeiro → A receber: receber débitos de clientes na conta financeira ou vincular créditos manuais existentes aos débitos sem movimentar dinheiro novamente.

## Configuração inicial

1. Cadastre as contas financeiras reais: dinheiro/caixa, bancos, valores de cartões e carteiras digitais.
2. Informe o saldo real inicial e sua data em cada conta. O saldo é registrado no extrato, pode ser negativo e não é sobrescrito posteriormente. Correções usam movimentação e estorno.
3. Revise as formas padrão criadas (Dinheiro, Pix, cartões de crédito/débito, transferência e boleto) e suas contas padrão.
4. Ajuste prazo de recebimento, máximo de parcelas e disponibilidade para o futuro PDV.
5. Revise as categorias padrão Vendas, Compra de mercadorias e Despesas gerais; crie outras conforme necessário.

Nenhuma conta ou saldo real foi presumido. Prazo e parcelamento da forma são parâmetros para a integração futura do PDV; baixas atuais usam a data, conta e valor informados. Cartões podem ter conta separada e ser transferidos para banco após liquidação. Não há integração bancária/adquirente automática nesta etapa.

## Comportamento financeiro

- Saldos são calculados pela soma de entradas financeiras imutáveis. Pagamentos reduzem a conta, recebimentos aumentam, e transferências criam os dois lados atomicamente sem alterar o saldo consolidado.
- Baixas têm data atual/passada, forma de pagamento e conta obrigatórias, categoria opcional e histórico de usuário/data de registro.
- Baixas parciais preservam o saldo restante; o banco rejeita valores acima do saldo. Operações têm UUID de pedido para repetição segura após falhas de conexão.
- Receber um débito gera crédito financeiro no extrato do cliente e atualiza seu saldo na mesma transação. Estornar gera lançamento compensatório e devolve a dívida, preservando os registros anteriores.
- Créditos antigos são mantidos. Vincular crédito associa-o ao débito sem duplicar dinheiro ou reduzir o saldo do cliente pela segunda vez. O valor disponível é validado para ambos os títulos. Recebimentos também respeitam o saldo líquido do cliente para evitar cobranças duplicadas enquanto há créditos sem vínculo.
- Entradas/saídas avulsas exigem categoria de receita/despesa compatível; transferências usam duas contas distintas e ativas.
- Estornos exigem motivo, data igual/posterior ao original e MASTER/ADMIN. Não é possível estornar o mesmo lançamento duas vezes nem estornar um estorno.
- Títulos com histórico financeiro (inclusive estornado) ficam protegidos contra edição/exclusão que altere os vínculos. Ajustes são registrados separadamente. Parcelas sem pagamentos continuam editáveis.
- Cadastros podem ser desativados; o histórico continua disponível. Contas negativas são permitidas e exibidas. A tela de extrato permite filtrar conta, tipo, categoria, período e descrição, com totais da seleção e identificação dos valores de entrada/saída por conta.

## Banco e permissões

Migration `20261010205630_financial_foundation.sql` aplicada somente ao desenvolvimento `klrnvnzhzmazuaawxele`. Novas tabelas: financial_accounts, financial_categories, financial_payment_methods, financial_operations e financial_entries. Campos adicionados aos títulos para categoria e vínculo financeiro.

RLS restringe leitura a usuários ativos MASTER/ADMIN/OPERATOR. Escrita em tabelas financeiras somente por RPC. Funções públicas SECURITY INVOKER chamam funções autorizadas em app_private, com search_path vazio. Operadores registram movimentações e baixas; configuração e estorno são administrativos. Locks serializam pedidos, parcelas, créditos/débitos e contas; as transações garantem que a baixa e a movimentação de dinheiro sejam registradas juntas.

Advisors verificados: novas tabelas constam do aviso de descoberta GraphQL por authenticated, esperado para a interface; políticas impedem leitura por contas sem acesso. Os demais avisos eram preexistentes. Referência: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

## Validação

- Suíte completa com as primeiras adições: 26 arquivos e 128 testes aprovados.
- Depois de adicionar testes de integração do extrato, baixas parciais e API: 34 testes em três arquivos aprovados.
- Após ajustar a exibição dos sinais no extrato: três testes da tela aprovados.
- Build de produção aprovado; permanece o aviso de tamanho do bundle.
- SQL financial_foundation aprovado antes e depois da migration, com rollback: saldos iniciais positivos/negativos e repetição segura, vínculo e estorno de crédito, recebimentos parciais/totais e compensação, proteção dos títulos, pagamento acima do saldo, transferências balanceadas, despesas avulsas, categoria incompatível, data futura, conta inativa, escrita direta negada, permissões de operador e bloqueio de acesso não autorizado/anon.
- Regressões SQL de notas manuais, importação XML e contas a pagar aprovadas após a migration.
- Dados dos testes revertidos; sem alteração dos saldos reais. Sem publicação do frontend, commit ou push nesta etapa.

## Próxima etapa

Abertura/fechamento de caixa por operador/terminal, sangria e suprimento, conferência por forma de pagamento, vendas do PDV, pagamentos divididos, estorno de vendas e integração atômica entre venda, estoque, caixa e financeiro. Os cadastros e movimentos financeiros desta etapa serão usados nessa integração.
