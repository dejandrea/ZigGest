# Preenchimento de fornecedor por CNPJ — 10/10/2026

- Consulta automática ao sair do campo CPF/CNPJ quando o CNPJ numérico possui 14 dígitos e verificadores válidos. CPF e CNPJ alfanumérico permanecem manuais nesta integração.
- Botão **Consultar CNPJ** permite nova tentativa. Consultas automáticas repetidas para o mesmo documento são evitadas até sua alteração.
- Fonte pública: BrasilAPI, endpoint `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`. Não é integração direta com SEFAZ nem requer credenciais/contratação Serpro.
- Preenche campos vazios de razão social, nome fantasia, telefone, e-mail e endereço com os dados disponíveis. Dados digitados ou provenientes da NF-e são preservados, inclusive alterações feitas enquanto a consulta está em andamento.
- Respostas para documento anterior são descartadas. Requisição é cancelada ao alterar o documento, fechar o formulário ou salvar. Timeout de 8 segundos evita espera indefinida.
- Falha de rede, timeout, limite do serviço, documento inválido, não encontrado ou resposta incompatível gera aviso e permite preenchimento e salvamento manuais.
- A consulta não salva o cadastro: o usuário confere os dados e usa **Salvar fornecedor**.
- Mesmo formulário atende Fornecedores, entradas manuais, NF-e XML e NF-e digitada.

Verificação: 17 testes em 4 arquivos passaram (consulta, timeout, retorno incompatível, preservação dos campos, resposta antiga descartada, fallback manual e regressões dos cadastros/entradas). Build Vite passou. Verificação real do endpoint por HEAD retornou HTTP 200 e `access-control-allow-origin: *`. A consulta real da função implementada passou usando User-Agent de navegador: razão social, nome fantasia, endereço e telefone retornados para o CNPJ público 19131243000197. O User-Agent padrão do Node recebeu HTTP 403; o serviço do frontend usa a identificação normal do navegador.

Dependência de disponibilidade/atualização da fonte externa; dados ausentes continuam editáveis. Sem novas dependências, alterações no banco, deploy, commit ou push.

Documentação da fonte: https://github.com/BrasilAPI/BrasilAPI/blob/main/pages/docs/doc/cnpj.json.
