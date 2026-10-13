# Compras e alertas de estoque

O menu Compras → Listas e cotações reúne os insumos ativos cujo saldo consolidado está no mínimo ou abaixo. O mínimo continua opcional. A sugestão repõe acima do limite: uma unidade adicional para UN/CX/PCT ou 0,001 para unidades fracionárias. Quantidades e seleção podem ser ajustadas antes da cotação. As listas por fornecedor são alternativas; um insumo vinculado a vários fornecedores aparece em cada lista, sem multiplicar a quantidade da seleção.

O sino permanece fixo na interface com o número de alertas ativos, um por insumo. Mudanças de saldo, mínimo, nome e situação atualizam os alertas no banco. Reposição acima do mínimo, remoção do limite ou desativação resolve o alerta. A interface consulta ao navegar, após operações do sistema, ao voltar à janela e a cada 60 segundos enquanto visível. Falhas de consulta aparecem como indisponibilidade, sem apresentar zero incorretamente. O resumo pode ser copiado para envio manual pelo WhatsApp.

O cadastro do insumo permite três fornecedores inicialmente, com opção de adicionar mais, até 50 vínculos manuais. Seleções duplicadas são bloqueadas. NF-e XML e manual vinculam os insumos ao fornecedor identificado pelo CNPJ. Se ele ainda não existe, nome e CNPJ da nota geram um cadastro básico, que pode ser completado depois. Entradas manuais com fornecedor também criam o vínculo. Fornecedores inativos permanecem no histórico e não participam de novas sugestões. Vínculos históricos foram recuperados das entradas existentes quando já havia fornecedor cadastrado.

## Cotações e decisão

Cada cotação preserva nome, insumos, unidades e quantidades, com propostas por fornecedor. Os preços são informados na unidade base, com até quatro casas decimais. Campos vazios significam não cotado. A solicitação de cotação pode ser copiada, sem envio automático a terceiros.

O comparativo inclui preço dos itens, frete, desconto, validade e prazo de entrega. Cada linha é arredondada para centavos, usando cálculo decimal inteiro no frontend e `numeric` no banco.

- **Melhor custo geral:** compara fornecedores com proposta válida para a compra inteira, incluindo frete e desconto. Não trata uma proposta parcial como compra completa nem apresenta uma otimização combinatória global.
- **Melhor custo por insumo:** permite escolher o insumo para consultar seu menor preço e sugere uma compra dividida pelos menores preços unitários. O total conta um frete por fornecedor utilizado. O desconto só é aplicado quando todos os itens daquela proposta são selecionados. A tela destaca que a compra dividida pode ficar mais cara com os fretes.

Propostas vencidas, fornecedores inativos e itens sem cotação válida não podem compor uma decisão. Mudanças precisam ser salvas antes de definir a compra. Revisões protegem contra sobrescrita por outra sessão; repetição de salvamento e decisão não duplica o registro. Cotações definidas ou canceladas preservam o histórico. A decisão é recalculada no banco e não aceita um total fornecido pelo cliente.

Definir uma compra não altera estoque nem cria financeiro. O recebimento continua pelo fluxo de entrada manual ou NF-e, com a opção de contas a pagar já existente.

## IA e WhatsApp

Alertas de mínimo e comparações funcionam sem serviço de IA e sem custo de chamadas de modelos. Uma camada futura de IA pode analisar consumo, sazonalidade e prazos, mantendo os cálculos e validações determinísticos. Há APIs com faixas gratuitas limitadas; uso de produção depende do volume e da política do provedor. [Preços do Gemini](https://ai.google.dev/gemini-api/docs/pricing).

O envio automático pelo WhatsApp requer configuração da plataforma oficial e não tem gratuidade garantida. A Meta cobra por mensagens conforme categoria e destino, com exceções para atendimento e determinadas respostas dentro de janelas elegíveis. Um alerta proativo ao proprietário pode exigir template aprovado e cobrança. Nesta etapa, foi incluída a cópia do resumo para envio manual; nenhuma mensagem externa é enviada automaticamente. [Preços oficiais do WhatsApp](https://business.whatsapp.com/products/platform-pricing).

## Verificação

- Suíte completa do frontend: 205 testes em 41 arquivos passaram; testes direcionados também cobrem o cadastro de três fornecedores e os ajustes finais de cotação.
- SQL com rollback: ciclo dos alertas, três vínculos por insumo, entrada manual, fornecedor de NF-e XML/manual e custo convertido, propostas completas/parciais, frete, seleção por insumo, revisão, repetição, histórico e acesso não autorizado.
- Build e UTF-8 passaram; permanece o aviso existente de tamanho do bundle.
- Migração `20261011182121_purchase_management.sql` aplicada somente ao desenvolvimento `klrnvnzhzmazuaawxele`.

As três novas tabelas usam RLS e permitem consulta apenas aos perfis habilitados. Escritas diretas são bloqueadas; funções autenticadas fazem as operações com logs. Os advisors mantiveram as categorias anteriores; as novas tabelas passam a integrar a visibilidade de metadados GraphQL para usuários autenticados, com leitura protegida por RLS. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0027_pg_graphql_authenticated_table_exposed).

Sem deploy ou push nesta etapa.
