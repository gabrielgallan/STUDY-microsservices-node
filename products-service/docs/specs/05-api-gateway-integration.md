# Integração do products-service com o api-gateway

## Objetivo

Finalizar a integração entre o `products-service` e o `api-gateway`, disponibilizando saúde e documentação no serviço de produtos e garantindo que criação e consultas de produtos funcionem de ponta a ponta pela porta pública `3005` do marketplace.

## Escopo

Esta especificação cobre:

- o endpoint público de saúde do `products-service`;
- a documentação Swagger/OpenAPI do `products-service`;
- a confirmação do endereço do serviço de produtos no ambiente do `api-gateway`;
- a disponibilização e verificação do encaminhamento das rotas de produtos pelo gateway;
- a verificação do repasse do header `Authorization` na criação de produtos;
- a validação do fluxo integrado de login, criação e consulta de produtos pela porta `3005`.

Não fazem parte deste escopo alterações no mecanismo de proxy, circuit breaker, retry, timeout, fallback, health check ou guards existentes no `api-gateway`. Também não fazem parte deste escopo novos endpoints de negócio, update, delete, paginação, filtros, busca por texto ou mudanças nos contratos existentes de autenticação e produtos.

## Contrato de saúde

Quando o `products-service` estiver disponível, `GET /health` deve retornar HTTP `200` com o seguinte contrato:

| Campo | Valor |
| --- | --- |
| `status` | `ok` |
| `service` | `products-service` |

A resposta deve conter somente informações necessárias para identificar que o serviço está disponível e não deve expor credenciais, variáveis de ambiente, detalhes do banco de dados ou informações internas sensíveis.

## Requisitos funcionais do products-service

### RF-PS-01 — Saúde do serviço

- O `products-service` deve disponibilizar `GET /health`.
- A rota deve ser pública e não deve exigir autenticação.
- Requisições sem header `Authorization` ou com token inválido não devem ser bloqueadas pelo guard JWT global.
- Quando o serviço estiver disponível, a rota deve retornar HTTP `200` com `status` igual a `ok` e `service` igual a `products-service`.
- A rota deve ser compatível com a verificação de saúde já existente no `api-gateway`.
- O endpoint deve indicar a disponibilidade HTTP do serviço sem introduzir um novo contrato de diagnóstico de dependências.

### RF-PS-02 — Swagger/OpenAPI

- O `products-service` deve disponibilizar documentação Swagger/OpenAPI gerada automaticamente.
- A interface de documentação deve ser acessível em `GET /api` enquanto o serviço estiver em execução.
- A documentação deve apresentar o título `Products Service`.
- A documentação deve apresentar a versão `1.0`.
- A documentação deve oferecer suporte à autenticação Bearer com JWT para permitir a execução documentada das rotas protegidas.
- Os endpoints de saúde, criação e consulta existentes devem estar representados conforme seus contratos HTTP e respectivos requisitos de autenticação.
- O acesso à documentação em `/api` não deve exigir autenticação.

## Requisitos funcionais do api-gateway

### RF-GW-01 — Endereço do products-service

- O arquivo de ambiente do `api-gateway` deve definir `PRODUCTS_SERVICE_URL` com o endereço efetivo do `products-service`.
- Para execução local, o valor deve ser `http://localhost:3002`.
- O gateway deve utilizar esse endereço como destino das requisições direcionadas ao serviço de produtos e de sua verificação de saúde.
- A porta pública do gateway deve permanecer `3005`.
- Não deve haver divergência entre o valor do ambiente utilizado em execução e o destino usado pela infraestrutura de proxy.

### RF-GW-02 — Encaminhamento das rotas de produtos

- O gateway deve disponibilizar e encaminhar corretamente ao `products-service` as rotas de produtos já previstas pelo marketplace.
- Devem funcionar pela porta `3005`, no mínimo, `POST /products`, `GET /products`, `GET /products/seller/:sellerId` e `GET /products/:id`.
- O método HTTP, o caminho, os parâmetros, o corpo e os headers necessários a cada operação devem chegar ao `products-service` sem alteração de significado.
- O status HTTP e o corpo retornados pelo fluxo integrado devem preservar o contrato da operação solicitada.
- A integração deve utilizar a infraestrutura de proxy existente para o destino `products`, preservando circuit breaker, retry, timeout e fallback.
- Caso seja necessário expor as rotas no gateway, isso deve apenas conectar os contratos HTTP de produtos ao proxy existente, sem substituir, duplicar ou alterar o mecanismo de proxy.

### RF-GW-03 — Autenticação e repasse do Authorization

- As consultas públicas de produtos devem continuar acessíveis pelo gateway sem JWT.
- `POST /products` deve continuar exigindo um JWT válido de um usuário com role `seller`, conforme o contrato atual do `products-service`.
- O gateway deve repassar ao `products-service` o header `Authorization` recebido na criação, preservando integralmente o esquema Bearer e o token.
- O `products-service` deve receber e validar o mesmo JWT obtido pelo cliente no fluxo de login.
- Uma criação sem token ou com token inválido deve retornar HTTP `401` e não deve persistir produto.
- Uma criação autenticada como buyer deve continuar retornando HTTP `403` e não deve persistir produto.
- O comportamento dos guards existentes no gateway e no `products-service` não deve ser alterado por esta integração.

### RF-GW-04 — Integração com o health check

- A verificação de saúde existente no gateway deve consultar `GET /health` do `products-service` a partir do endereço configurado em `PRODUCTS_SERVICE_URL`.
- Com o `products-service` disponível na porta `3002` e respondendo ao contrato desta especificação, o gateway deve identificá-lo como saudável.
- O estado reportado para produtos deve refletir a resposta do serviço correto, sem consultar a porta do `users-service` ou de outro serviço.
- A integração não deve alterar o mecanismo geral de health check do gateway.

## Fluxos esperados pela porta 3005

### Fluxo 1 — Login de vendedor

1. O cliente envia `POST /auth/login` ao `api-gateway` na porta `3005` com credenciais válidas de um seller.
2. O gateway encaminha a autenticação ao `users-service` conforme a integração existente.
3. O `users-service` autentica as credenciais e retorna um JWT.
4. O gateway devolve ao cliente o token necessário para a criação do produto.

### Fluxo 2 — Criação de produto

1. O cliente envia `POST /products` ao `api-gateway` na porta `3005`, com o JWT do login no header `Authorization` e um corpo válido.
2. O gateway encaminha a requisição e o mesmo header `Authorization` ao `products-service`.
3. O `products-service` valida o JWT, confirma a role `seller` e cria o produto associado ao usuário autenticado.
4. O gateway devolve HTTP `201` e o produto criado conforme o contrato existente.

### Fluxo 3 — Consulta do catálogo

1. O cliente envia `GET /products` ao `api-gateway` na porta `3005`, sem necessidade de autenticação.
2. O gateway encaminha a consulta ao `products-service`.
3. O `products-service` retorna HTTP `200` com o catálogo de produtos ativos, ordenado do mais recente para o mais antigo.
4. O gateway devolve a mesma representação funcional ao cliente.

### Fluxo 4 — Consulta do produto criado

1. O cliente envia `GET /products/:id` ao `api-gateway` na porta `3005`, usando o ID recebido na criação e sem necessidade de autenticação.
2. O gateway encaminha a consulta ao `products-service` preservando o ID no caminho.
3. O `products-service` retorna HTTP `200` com o produto correspondente.
4. O gateway devolve o produto ao cliente; um ID inexistente deve preservar a resposta HTTP `404` do contrato de consulta.

## Cenário E2E obrigatório

O fluxo integrado deve ser testável por `curl` ou Postman com o `users-service` na porta `3001`, o `products-service` na porta `3002` e o `api-gateway` na porta `3005`:

1. Autenticar um seller exclusivamente por `POST /auth/login` no gateway e obter um JWT válido.
2. Criar um produto exclusivamente por `POST /products` no gateway, usando o JWT no header `Authorization`.
3. Confirmar que a criação retorna HTTP `201`, que o `sellerId` corresponde ao seller autenticado e que o produto foi persistido uma única vez.
4. Consultar `GET /products` exclusivamente pelo gateway, sem JWT, e confirmar que o produto criado aparece no catálogo ativo.
5. Consultar `GET /products/:id` exclusivamente pelo gateway, sem JWT, e confirmar que o produto retornado corresponde ao ID criado.
6. Confirmar que o header `Authorization` recebido pelo gateway na criação chegou inalterado ao `products-service`.
7. Confirmar que `POST /products` pelo gateway retorna `401` sem JWT ou com JWT inválido e não cria produto.
8. Consultar a saúde agregada do gateway e confirmar que o `products-service` é reportado como saudável.

## Respostas integradas esperadas

### 200 — Consulta realizada

- O catálogo e a consulta individual preservam as respostas de sucesso do `products-service`.
- O health check identifica o serviço de produtos como saudável quando `GET /health` responde corretamente.

### 201 — Produto criado

- A criação autenticada pela porta `3005` persiste e retorna o produto conforme o contrato existente.

### 400 — Requisição inválida

- Entradas inválidas e identificadores UUID malformados preservam as respostas de validação dos contratos existentes.

### 401 — Não autenticado

- Aplica-se à criação chamada pelo gateway sem JWT válido.

### 403 — Sem permissão

- Aplica-se à criação autenticada como buyer.

### 404 — Produto não encontrado

- Aplica-se à consulta individual quando não existe produto para o UUID solicitado.

## Critérios de aceite

1. `GET /health` existe no `products-service`, é público e retorna HTTP `200` com `{ status: "ok", service: "products-service" }`.
2. O health check não expõe informações sensíveis e não exige JWT válido.
3. A documentação automática do `products-service` está acessível em `/api` com título `Products Service`, versão `1.0` e suporte a Bearer Auth.
4. A documentação representa os endpoints públicos e protegidos do serviço conforme seus contratos atuais.
5. O ambiente local do `api-gateway` define `PRODUCTS_SERVICE_URL=http://localhost:3002` e o destino efetivamente utilizado pelo proxy corresponde a esse valor.
6. O health check existente do gateway identifica o `products-service` como saudável quando ele está disponível e responde ao contrato definido.
7. `POST /products` na porta `3005`, com JWT válido de seller, retorna HTTP `201` e cria exatamente um produto no `products-service`.
8. O header `Authorization` recebido na criação é repassado ao `products-service` sem perda ou alteração do token.
9. `POST /products` na porta `3005` retorna `401` sem JWT ou com JWT inválido e não cria produto.
10. `POST /products` na porta `3005` retorna `403` para buyer autenticado e não cria produto.
11. `GET /products` na porta `3005` é público, retorna HTTP `200` e inclui o produto ativo criado no cenário E2E.
12. `GET /products/seller/:sellerId` na porta `3005` é público e preserva o filtro de vendedor e atividade do contrato existente.
13. `GET /products/:id` na porta `3005` é público e retorna o produto correspondente ou `404` quando ele não existe.
14. Métodos, caminhos, parâmetros, corpos, headers, status e respostas atravessam o gateway sem alteração de significado.
15. O cenário E2E obrigatório pode ser executado integralmente por `curl` ou Postman pela porta `3005`, sem acesso direto do cliente às rotas de autenticação ou produtos nos serviços internos.
16. O mecanismo de proxy, circuit breaker, retry, timeout, fallback, health check e os guards existentes no gateway permanecem inalterados.
17. Não são adicionados update, delete, paginação, filtros, busca por texto ou outros endpoints fora do escopo.
