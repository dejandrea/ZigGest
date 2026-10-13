# Entradas manuais e por NF-e — 10/10/2026

## Fluxo implementado

- Entrada manual existente permanece disponível com conversão de embalagens e data retroativa.
- Botão **Entrada por NF-e** no estoque/insumos e nas movimentações.
- Campo para chave de acesso com validação dos 44 dígitos e dígito verificador, cópia da chave e acesso ao portal oficial. Conforme escolha do usuário, o download é feito pelo portal e o arquivo é selecionado no aplicativo; não há captura automática pela SEFAZ nesta etapa.
- Importação do XML completo `nfeProc`, modelo 55, com protocolo de autorização de produção. Notas de homologação, XML malformado, entidades/DOCTYPE, protocolo incompatível e itens inválidos são recusados. Limite de 2 MB e até 990 itens.
- Dados de fornecedor, destinatário, emissão, série, número, valor total e itens ficam disponíveis para conferência.
- Cada item deve ser vinculado a um insumo ativo. Quantidade recebida e unidades por embalagem podem ser ajustadas. Exemplo: 2 PCT × 12 = 24 UN.
- O botão **Novo insumo** abre o cadastro diretamente na entrada manual ou no item da NF-e, preservando o processo em andamento. Na nota, o nome inicia com a descrição do produto. Ao salvar, o insumo ativo fica disponível e selecionado no item de origem, sem alterar as outras linhas, quantidades, conversões, data ou observações. Cancelar ou falhar no cadastro mantém a entrada.
- O cadastro de fornecedor pode ser aberto diretamente nas entradas manuais e por NF-e. Na NF-e, razão social, nome fantasia, documento, telefone e endereço são preenchidos com os dados disponíveis do emitente; inscrição estadual é sugerida nas observações. Os dados podem ser revisados antes de salvar. O documento é consultado entre os fornecedores existentes, ignorando formatação, para evitar cadastrar novamente o mesmo emitente. Salvar ou cancelar não interrompe a entrada. O cadastro usa o formulário compartilhado da tela Fornecedores e permanece uma operação independente da gravação da nota, sem criar vínculo adicional no banco nesta etapa.
- Quantidade comercial original e recebida ficam separadas. Quantidades/conversões de estoque usam até três casas decimais; precisão adicional do XML original é preservada e requer ajuste explícito se não puder ser representada no estoque.
- Vários itens da nota podem alimentar o mesmo insumo; consumo convertido é somado antes de atualizar o saldo.
- Data de entrada inicia na emissão e pode ser ajustada para a chegada real, inclusive retroativa. A data de registro permanece separada.
- Histórico permite consultar a NF-e, as quantidades originais/recebidas, os vínculos/conversões e baixar novamente o XML completo. Exportação em UTF-8 atualiza a declaração de codificação quando necessário.

## Banco e proteção

Migração `20261010194341_invoice_inventory_entries.sql` aplicada ao projeto de desenvolvimento `klrnvnzhzmazuaawxele`.

- Tabelas `stock_invoices` e `stock_invoice_items` com RLS e leitura limitada a MASTER, ADMIN e OPERATOR autorizados/ativos. Sem gravação ou exclusão direta pelo frontend.
- XML original completo armazenado para preservar impostos, frete, transporte, cobrança, pagamento e demais grupos da NF-e, mesmo quando não exibidos individualmente.
- XML é interpretado novamente no banco. Cabeçalho e itens não são aceitos como metadados arbitrários do cliente.
- RPC pública SECURITY INVOKER chama função privada privilegiada com checagem de autorização e `search_path` vazio.
- Nota inteira, vínculos, histórico e saldos são gravados na mesma transação. Qualquer falha reverte tudo.
- Chave da NF-e única impede segunda entrada por outro UUID. Repetição do mesmo UUID/dados retorna a movimentação existente. Conteúdo/data alterados com o mesmo UUID são recusados.
- Locks de pedido, chave e insumos em ordem consistente evitam entradas concorrentes duplicadas e perdas de saldo.
- Lista de movimentações não carrega o payload/XML; o documento completo só é obtido ao consultar a nota.
- Nenhuma nota real foi importada nos testes. Fixtures e movimentações executadas em transações revertidas.

## Validação e limites

Testes frontend cobrem leitura do XML, namespaces, chave, codificação, limites, recusa de notas inválidas, conversão, ajuste de recebimento, repetição segura, portal e RPC. 90 testes passaram em 16 arquivos (suíte principal com 89 testes e teste adicional de consulta/download). Build Vite passou. Testes SQL passaram para 2×12=24, regularização -5→19, agregação de linhas, quantidade ajustada, rollback integral, duplicidade, data retroativa e bloqueio de acesso anônimo/não autorizado.

Advisors registram descoberta das duas novas tabelas no GraphQL para autenticados pela permissão SELECT usada pelo app; RLS foi testada. Avisos anteriores de autenticação/administração permanecem.

O aplicativo valida a estrutura e o protocolo presentes no arquivo; não faz verificação criptográfica da assinatura nem consulta automática da situação atual/cancelamento. A interface orienta conferir destinatário e situação no portal. Sem certificado configurado, não há download automático por chave. Referência oficial: https://moc.sped.fazenda.pr.gov.br/NFeDistribuicaoDFe.html.

Esta entrada movimenta quantidades de estoque; não cria contas a pagar, cadastro automático de fornecedor, custo médio, venda ou escrituração fiscal. Não há estorno/cancelamento de entrada, importação de NFC-e/NFS-e, ZIP, nem lembrança automática de vínculos do fornecedor nesta etapa. Verificação visual em navegador não realizada. Sem deploy do frontend, push ou commit automático.
