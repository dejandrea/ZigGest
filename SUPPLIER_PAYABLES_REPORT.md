# Contas a pagar vinculadas às entradas

Implementado em 10/10/2026 no ambiente de desenvolvimento Supabase `klrnvnzhzmazuaawxele`.

## Comportamento

- Após registrar a entrada por XML, a nota digitada ou a entrada sem nota, aparece o convite para lançar o financeiro. Recusar não cria conta a pagar.
- Aceitar abre `/contas-pagar?entrada=<id>` com os dados obtidos da entrada já persistida. A URL permite recuperar o formulário após atualizar a página.
- Entradas sem nota permitem informar fornecedor e total opcionais; estes dados são persistidos junto com a movimentação em uma transação. Quando não informados, podem ser preenchidos no financeiro.
- Notas preenchem nome/documento do emitente, total e descrição. O fornecedor cadastrado é vinculado pelo documento; fornecedor ainda não cadastrado pode ser criado dentro do formulário ou informado pelo nome/documento.
- XML importa referências, valores e vencimentos de `cobr/dup`, e apresenta os detalhes de `pag/detPag` para conferência. Uma única forma de pagamento é sugerida nas parcelas; múltiplas formas ficam disponíveis no resumo para ajuste manual.
- Sem duplicatas no XML, o formulário começa com uma parcela, total da nota e vencimento na data atual. Datas e valores continuam editáveis.
- Parcelamento mensal de 1 a 120 parcelas, com distribuição exata dos centavos e vencimentos ajustados ao último dia de meses curtos. Cada parcela pode ser editada individualmente.
- A soma das parcelas precisa corresponder ao total, tanto no frontend quanto no banco. Pode-se ajustar o total financeiro para refletir o compromisso efetivo, por exemplo pagamentos parciais já efetuados.
- Uma entrada pode gerar somente um lançamento financeiro; repetir o mesmo pedido não duplica parcelas. Falha ou cancelamento no financeiro preserva a entrada de estoque.
- Histórico de estoque oferece “Lançar financeiro” para concluir depois. Lançamentos já registrados podem ser editados na tela de contas a pagar.
- Lista permite buscar fornecedor/descrição, filtrar vencidas/a vencer e visualizar totais.

## Escopo confirmado

Nesta etapa são registrados compromissos a pagar. Contas bancárias, categorias, baixa de pagamentos e conciliação ficaram para a próxima etapa, conforme resposta do usuário. Dados de pagamento na NF-e não representam baixa automática.

## Banco e segurança

Migration `20261010204104_supplier_payables.sql` aplicada somente ao projeto de desenvolvimento. Tabelas `supplier_payables` e `supplier_payable_installments`, protegidas por RLS para usuários ativos MASTER/ADMIN/OPERATOR. Escritas somente por RPC com validações, locks e transação; não há insert/update/delete direto para authenticated ou acesso anon. Funções com privilégios elevados ficam em `app_private`, com autorização explícita e search_path vazio; wrappers públicos são SECURITY INVOKER.

Advisors verificados: novas tabelas aparecem no aviso de descoberta do schema GraphQL por authenticated, esperado para tabelas disponíveis à interface; RLS impede leitura de contas desabilitadas/não autorizadas. Demais avisos já existiam no projeto (funções administrativas, teste_conexao, proteção de senhas e tabelas internas sem políticas). Referência do aviso: https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed

## Validação

- Suíte completa: 23 arquivos, 116 testes aprovados.
- Após adicionar três testes da API: arquivo API com 25 testes aprovados, cobrindo total/fornecedor da entrada, payload financeiro e importação dos vencimentos da NF-e.
- Build de produção aprovado.
- SQL `supabase/tests/supplier_payables.sql` aprovado antes e depois da migration, com rollback: conversão 2 × 12, repetição segura, metadados da entrada, parcelas/soma, origem única, falha atômica, edição, origem imutável, bloqueio de escrita direta e acesso não autorizado/anon.
- Não houve publicação do frontend, push ou commit nesta etapa.

Referência dos grupos de cobrança e pagamento: [MOC 7.0 — Anexo I, portal oficial NF-e](https://hom.nfe.fazenda.gov.br/PORTAL/exibirArquivo.aspx?conteudo=DQFCIFUzszw%3D).
