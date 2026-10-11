# Comandas e caixa

Mesas foram substituídas por Comandas no menu, início e atendimento. A rota anterior redireciona para `/comandas`. Os registros existentes foram preservados; as tabelas mantêm os nomes históricos para compatibilidade.

Comandas novas exigem caixa aberto e identificação. Podem vincular cliente cadastrado ou permanecer avulsas. O botão Novo cliente abre o cadastro sobre a mesma tela, preenche o nome e vincula o cliente criado à comanda.

Cada baixa aceita até dez formas de pagamento. É possível pagar quantidades selecionadas de itens, abater um valor livre ou encerrar pagando o saldo restante. As baixas parciais preservam o consumo original e mantêm a comanda aberta, mesmo quando o saldo fica zerado, até o encerramento explícito. Quantidades já pagas ficam registradas; pagamentos por valor não alteram quantidades e limitam novas baixas ao saldo restante.

O rateio divide o saldo atual entre 1 e 100 pessoas em centavos, distribuindo o arredondamento para preservar a soma. Cada parte abre um pagamento por valor editável, com formas combinadas. As partes restantes são mantidas enquanto o modal está aberto se o pagamento respeitar o valor calculado; o rateio é um auxílio de cálculo e pode ser recalculado, sem criar lançamentos automaticamente.

Pagamentos imediatos geram entradas financeiras com a categoria configurada no caixa e a conta padrão da forma, ou a conta da abertura. Cada baixa a prazo gera um débito próprio para o cliente responsável selecionado nesse pagamento, ativo e liberado, dentro do limite. O responsável pode ser diferente do cliente da comanda e pode ser cadastrado durante o pagamento sem perder os dados. Comandas sem saldo podem ser encerradas sem novo pagamento.

Encerramentos são transacionais e não reaplicam valores em tentativas repetidas. Itens encerrados e débitos de origem são protegidos contra edição e exclusão. A baixa do débito usa o fluxo existente de recebimentos, inclusive parciais. Estornos financeiros permanecem disponíveis ao administrador; não reabrem a comanda.

A base de caixa permite uma sessão aberta por estabelecimento, seleção de formas de pagamento, acompanhamento por forma e fechamento com histórico. Qualquer comanda aberta impede o fechamento no banco. Comandas antigas abertas são vinculadas ao primeiro caixa aberto. Saldos de abertura e fechamento são referências da conta financeira, não contagens físicas de dinheiro.

O consumo mantém o lançamento manual de descrição, preço e quantidade. O vínculo de produtos e a baixa automática de estoque serão tratados com o PDV. Esta etapa não inclui sangria, suprimento ou conferência física do caixa.

## Verificação

Testes SQL com rollback: abertura única de caixa, identificação avulsa, vínculo de cliente, pagamento dividido, totais e saldos desatualizados, rollback de falhas, crédito a prazo, limite e permissões, confirmação repetida, imutabilidade de itens pagos e baixa posterior do débito. O fluxo parcial verifica seleção de itens, parcelas por valor com formas combinadas, múltiplos débitos na mesma comanda, proteção contra quantidade excedida e pagamento acima do saldo, encerramento pelo saldo e fechamento sem pagamento quando o saldo já foi quitado. Testes de tela cobrem cadastro de cliente e pagador sem perder consumo ou pagamento, rateio, revisão, saldo após baixas anteriores e inclusão dos recebimentos parciais no caixa. Build e UTF-8 verificados.

As tabelas novas possuem RLS e permissões de leitura para os perfis habilitados do aplicativo. A visibilidade dos nomes no esquema GraphQL autenticado é apontada pelo advisor, como nas demais tabelas; as políticas de dados foram verificadas. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).

Migração aplicada apenas ao desenvolvimento. Sem commit, push ou deploy nesta implementação.
