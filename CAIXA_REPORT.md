# Operações de caixa

O caixa usa uma conta financeira ativa do tipo dinheiro / caixa e uma categoria de receita. Todas as formas de pagamento ativas ficam disponíveis automaticamente, inclusive formas ativadas após a abertura. O indicador `usar_pdv` não restringe pagamentos de comandas nesta etapa.

O valor de abertura representa dinheiro para troco. Pode vir do saldo já existente na conta financeira do caixa ou de uma transferência de outra conta. Não gera receita de venda. A transferência exige saldo suficiente na origem. O caixa continua limitado a uma sessão aberta por estabelecimento.

Sangria e suprimento exigem valor positivo, outra conta financeira ativa e motivo. São transferências financeiras vinculadas ao caixa. A sangria não pode ultrapassar o dinheiro físico esperado, e as transferências não podem ultrapassar o saldo financeiro da origem. Pagamentos em dinheiro usam a conta financeira do caixa; outras formas usam a conta padrão da forma ou a conta do caixa.

O dinheiro esperado é abertura + suprimentos - sangrias + recebimentos em dinheiro não estornados, inclusive pagamentos parciais. O tipo da forma é preservado em cada recebimento para que futuras alterações do cadastro não mudem a conferência histórica. Pix, cartões e vendas a prazo ficam separados do dinheiro físico. O fechamento exige encerramento de todas as comandas, valor contado, saldo esperado atualizado e motivo para diferenças. Diferenças ficam registradas na conferência, sem criar ajustes contábeis automáticos.

Cada finalização de comanda gera uma venda com número sequencial dentro do caixa. A sequência começa em 1 a cada abertura, não reutiliza números cancelados e não avança em confirmações repetidas. Vendas anteriores recebem números determinísticos por data e identificador, sem alterar seus movimentos financeiros.

Cancelamento e reabertura exigem administrador, caixa da venda ainda aberto e motivo. Estornam os pagamentos imediatos e anulam débitos a prazo por créditos compensatórios imutáveis, preservando todo o histórico. Se o débito já teve recebimento ou crédito vinculado, essas baixas precisam ser estornadas antes. Se houve sangria e não há dinheiro para devolver a parte paga em dinheiro, é necessário suprimento. Estornos isolados de pagamentos e transferências do caixa pela tela financeira são bloqueados para preservar a conferência.

Na reabertura, uma nova comanda recebe o mesmo registro da venda e uma cópia do consumo, com saldo integral a pagar. A venda mantém o vínculo com a comanda aberta, e a tela informa seu número com um link direto. A identidade técnica interna da comanda permanece única; o número de registro exibido é o da venda no caixa. A nova finalização atualiza a mesma venda e mantém seu número. O caixa não fecha enquanto essa comanda estiver aberta.

O checkbox de nota fiscal começa desmarcado na finalização. Pode ser alterado em vendas finalizadas, inclusive de caixas fechados, pois é uma informação administrativa e não altera o movimento financeiro. Apenas registra se a nota foi gerada; não emite nem cancela documentos fiscais.

As mutações confirmadas de cadastros, contas, estoque, comandas, financeiro, caixa e vendas geram logs privados com autor, perfil, data, entidade, operação, dados anteriores e posteriores e transação. Os logs não são expostos ao cliente e não podem ser editados ou apagados. Tentativas recusadas e operações revertidas pela transação não persistem logs. Os relatórios de registros de operações e vendas com/sem nota fiscal estão no menu com página “Em breve”, conforme solicitado.

Esta etapa mantém o consumo manual das comandas. Não introduz frente de PDV nem baixa automática de estoque. Registros e vendas de caixas fechados não podem ser cancelados ou reabertos para evitar alteração retroativa da conferência.

## Verificação

Testes SQL transacionais cobrem troco, transferência na abertura, formas ativas sem restrição por caixa, sangria/suprimento, saldo insuficiente, idempotência, numeração, nota fiscal, estorno de venda, anulação de débito, recebimento prévio, reabertura com consumo preservado, nova finalização com número original, bloqueio de caixa fechado e comandas abertas, conferência desatualizada, diferenças, permissões e logs imutáveis. Os testes de comandas, pagamentos parciais e financeiro também passam com a nova migração.

Testes de interface cobrem abertura, conferência, sangria, alerta da comanda reaberta, checkbox fiscal, métodos ativos, permissões de operador e opções de relatórios. A suíte completa passou com 173 testes; build e verificação UTF-8 passaram. Migração aplicada apenas ao desenvolvimento, sem commit, push ou deploy automático.

O advisor registra RLS sem políticas nos logs privados: o acesso de clientes é negado por padrão e as permissões estão revogadas; somente os gatilhos internos escrevem. As tabelas públicas de vendas e movimentos permitem leitura aos perfis habilitados com RLS, sendo seus nomes descobertos no esquema GraphQL autenticado, como nas demais tabelas do aplicativo. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed). Nenhuma nova função `SECURITY DEFINER` foi exposta no esquema público.
