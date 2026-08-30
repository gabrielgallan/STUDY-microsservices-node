# Integração do users-service com o api-gateway

## Objetivo

Finalizar a integração entre o `users-service` e o `api-gateway`, disponibilizando os contratos necessários para validação de tokens, monitoramento de saúde e documentação da API, e garantindo que os fluxos de autenticação e consulta de usuários funcionem de ponta a ponta pela porta pública do gateway.

## Escopo

Esta especificação cobre:

- o endpoint de validação de token do `users-service`;
- o endpoint de saúde do `users-service`;
- a documentação Swagger/OpenAPI do `users-service`;
- a configuração do endereço do `users-service` no `api-gateway`;
- a verificação do encaminhamento das rotas de autenticação e usuários;
- a verificação do repasse do header `Authorization`;
- a validação E2E dos fluxos de registro, login, perfil e listagem de vendedores através do gateway.

Não fazem parte deste escopo alterações no mecanismo de proxy, circuit breaker, retry, timeout ou guards já existentes no `api-gateway`. Também não fazem parte deste escopo gerenciamento de sessão, autenticação por sessão, refresh tokens, logout, revogação de tokens, novos papéis de usuário ou novos fluxos de negócio.

## Contratos funcionais

### Resposta de validação de token

Quando um JWT válido for apresentado a `GET /auth/validate-token`, a resposta deve conter exatamente os dados da identidade autenticada:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `userId` | UUID | Identificador do usuário representado pelo JWT |
| `email` | string | E-mail do usuário representado pelo JWT |
| `role` | enum | Papel do usuário: `seller` ou `buyer` |

A resposta não deve incluir senha, hash, token, status, nomes, timestamps ou outros dados da entidade de usuário.

### Resposta de saúde

Quando o `users-service` estiver disponível, `GET /health` deve retornar HTTP `200` com o seguinte contrato lógico:

| Campo | Valor |
| --- | --- |
| `status` | `ok` |
| `service` | `users-service` |

## Requisitos funcionais do users-service

### RF-US-01 — Validação de token

- O `users-service` deve disponibilizar `GET /auth/validate-token`.
- A rota deve ser protegida pela autenticação JWT global já existente.
- A requisição deve exigir um JWT válido no header HTTP `Authorization` no formato Bearer.
- Um token válido deve produzir HTTP `200` com `userId`, `email` e `role` correspondentes à identidade autenticada.
- O campo `userId` da resposta deve corresponder ao identificador do usuário autenticado disponibilizado após a validação do JWT.
- A resposta deve seguir exclusivamente o contrato de validação de token definido nesta especificação.
- Uma requisição sem token ou com token ausente, malformado, expirado ou inválido deve retornar HTTP `401`.
- A rota deve permanecer disponível para o uso interno do `api-gateway` na validação de tokens.
- O endpoint não deve criar sessão nem retornar um novo token.

### RF-US-02 — Saúde do serviço

- O `users-service` deve disponibilizar `GET /health`.
- A rota deve ser pública e não deve exigir autenticação.
- A ausência do header `Authorization` não deve impedir sua execução.
- Quando o serviço estiver disponível, a rota deve retornar HTTP `200` com `status` igual a `ok` e `service` igual a `users-service`.
- A rota deve ser compatível com a verificação de saúde já existente no `api-gateway`.
- A resposta de saúde não deve expor credenciais, variáveis de ambiente, detalhes do banco de dados ou informações internas sensíveis.

### RF-US-03 — Swagger/OpenAPI

- O `users-service` deve disponibilizar documentação Swagger/OpenAPI gerada automaticamente.
- A documentação deve ser acessível em `GET /api` enquanto o serviço estiver em execução.
- A documentação deve apresentar o título `Users Service`.
- A documentação deve apresentar a versão `1.0`.
- A documentação deve oferecer suporte à autenticação Bearer para permitir a execução documentada de rotas protegidas com JWT.
- Os endpoints públicos e protegidos do `users-service` devem estar representados na documentação conforme seus contratos HTTP.
- O acesso à interface de documentação em `/api` não deve exigir autenticação.

## Requisitos funcionais do api-gateway

### RF-GW-01 — Endereço do users-service

- O arquivo de ambiente do `api-gateway` deve definir `USERS_SERVICE_URL` com o valor `http://localhost:3001` para execução local.
- O gateway deve utilizar esse endereço como destino das requisições direcionadas ao `users-service`.
- A porta pública do gateway deve permanecer `3005`.

### RF-GW-02 — Encaminhamento das rotas

- O gateway deve encaminhar corretamente ao `users-service` as requisições públicas aplicáveis em `/auth/*`.
- O gateway deve encaminhar corretamente ao `users-service` as requisições protegidas aplicáveis em `/users/*`.
- O método HTTP, o caminho funcional, o corpo da requisição e os dados necessários ao contrato de cada operação devem chegar ao `users-service` sem alteração de significado.
- O status HTTP e o corpo produzidos pelo fluxo integrado devem ser devolvidos ao cliente de acordo com o contrato da operação solicitada.
- A integração deve utilizar a infraestrutura de proxy já existente, preservando circuit breaker, retry e timeout.
- Esta integração não deve substituir, duplicar ou alterar o mecanismo de proxy existente.

### RF-GW-03 — Autenticação e repasse do Authorization

- As rotas públicas de registro e login devem continuar acessíveis pelo gateway sem JWT.
- As rotas protegidas de usuários devem continuar sujeitas à validação JWT já existente no gateway.
- O JWT emitido pelo login do `users-service` e devolvido pelo gateway deve ser aceito nas requisições protegidas subsequentes durante seu período de validade.
- O gateway deve repassar ao `users-service` o header `Authorization` recebido em uma requisição protegida, preservando o esquema Bearer e o token.
- O `users-service` deve receber e validar o mesmo JWT apresentado pelo cliente ao gateway.
- Uma requisição protegida sem token ou com token inválido deve retornar HTTP `401` e não deve produzir os dados da rota solicitada.
- O comportamento dos guards JWT e Session existentes no gateway não deve ser alterado por esta integração.
- Nenhum gerenciamento de sessão deve ser criado ou ampliado.

### RF-GW-04 — Integração com o health check

- A verificação de saúde existente no gateway deve consultar o endpoint público `GET /health` do `users-service` no endereço configurado.
- Com o `users-service` disponível na porta `3001` e retornando o contrato de saúde esperado, o gateway deve identificá-lo como saudável.
- A integração não deve alterar o mecanismo geral de health check já existente no gateway.

## Fluxos esperados pela porta 3005

### Fluxo 1 — Registro

1. O cliente envia `POST /auth/register` ao `api-gateway` na porta `3005`, sem autenticação.
2. O gateway encaminha a operação ao endpoint de registro do `users-service` na porta `3001`.
3. O `users-service` registra o usuário conforme o contrato já existente.
4. O gateway devolve ao cliente o resultado do registro.

### Fluxo 2 — Login

1. O cliente envia `POST /auth/login` ao `api-gateway` na porta `3005`, sem autenticação.
2. O gateway encaminha a operação ao endpoint de login do `users-service` na porta `3001`.
3. O `users-service` autentica as credenciais e emite o JWT conforme o contrato já existente.
4. O gateway devolve ao cliente o token JWT e os demais dados previstos pelo contrato de login.

### Fluxo 3 — Perfil autenticado

1. O cliente envia `GET /users/profile` ao `api-gateway` na porta `3005` com o token do login no header `Authorization`.
2. O gateway valida o JWT com o mecanismo de autenticação já existente.
3. O gateway encaminha a requisição e o header `Authorization` ao `users-service`.
4. O `users-service` valida o JWT e retorna o perfil do usuário autenticado conforme o contrato já existente.
5. O gateway devolve o perfil ao cliente.

### Fluxo 4 — Vendedores ativos

1. O cliente envia `GET /users/sellers` ao `api-gateway` na porta `3005` com o token do login no header `Authorization`.
2. O gateway valida o JWT com o mecanismo de autenticação já existente.
3. O gateway encaminha a requisição e o header `Authorization` ao `users-service`.
4. O `users-service` valida o JWT e retorna a lista de vendedores ativos conforme o contrato já existente.
5. O gateway devolve a lista ao cliente, incluindo uma lista vazia quando não houver vendedores ativos.

## Cenário E2E obrigatório

O fluxo integrado deve ser testável com o `users-service` executando na porta `3001` e o `api-gateway` executando na porta `3005`:

1. Registrar um novo usuário exclusivamente pela rota pública do gateway.
2. Autenticar esse usuário exclusivamente pela rota pública do gateway e obter um JWT.
3. Utilizar o JWT obtido para consultar `/users/profile` exclusivamente pelo gateway.
4. Confirmar que o perfil retornado corresponde ao usuário autenticado e não expõe a senha ou seu hash.
5. Utilizar o mesmo JWT para consultar `/users/sellers` exclusivamente pelo gateway.
6. Confirmar que a consulta retorna apenas vendedores ativos ou uma lista vazia.
7. Confirmar que `/users/profile` e `/users/sellers` retornam `401` pelo gateway quando o JWT não é apresentado ou é inválido.
8. Confirmar que o header `Authorization` chega ao `users-service` nas duas consultas protegidas.

## Critérios de aceite

1. `GET /auth/validate-token` existe no `users-service`, exige JWT válido e retorna HTTP `200` com exatamente `userId`, `email` e `role`.
2. `GET /auth/validate-token` retorna HTTP `401` sem token ou com token inválido, malformado ou expirado.
3. `GET /health` existe no `users-service`, é público e retorna HTTP `200` com `{ status: "ok", service: "users-service" }`.
4. A documentação automática do `users-service` está acessível em `/api` com título `Users Service`, versão `1.0` e suporte a Bearer Auth.
5. O ambiente local do `api-gateway` define `USERS_SERVICE_URL=http://localhost:3001`.
6. O health check existente do gateway identifica o `users-service` como saudável quando o serviço está disponível e responde ao contrato definido.
7. `POST /auth/register` na porta `3005` registra um usuário no `users-service` sem exigir JWT.
8. `POST /auth/login` na porta `3005` autentica o usuário no `users-service` e devolve um JWT utilizável.
9. `GET /users/profile` na porta `3005`, com o JWT emitido pelo login, retorna HTTP `200` com o perfil correto.
10. `GET /users/sellers` na porta `3005`, com o JWT emitido pelo login, retorna HTTP `200` com todos e somente os vendedores ativos, ou uma lista vazia.
11. O header `Authorization` recebido pelo gateway é repassado ao `users-service` sem perda ou alteração do token.
12. As rotas protegidas retornam HTTP `401` quando chamadas pelo gateway sem JWT ou com JWT inválido.
13. O cenário E2E obrigatório é executável integralmente pela porta `3005`, sem acesso direto do cliente aos endpoints de registro, login, perfil ou vendedores na porta `3001`.
14. O mecanismo de proxy, circuit breaker, retry, timeout e os guards existentes no gateway permanecem inalterados.
15. Nenhum mecanismo ou endpoint de gerenciamento de sessão é implementado.

## Rastreabilidade da implementação

- Cada conjunto funcional deve ser entregue em commit granular e identificável.
- O endpoint de validação de token e seus testes devem formar uma implementação rastreável.
- O endpoint de saúde e seus testes devem formar uma implementação rastreável.
- A configuração Swagger/OpenAPI e suas verificações devem formar uma implementação rastreável.
- A configuração e as verificações de integração do gateway devem formar uma implementação rastreável.
- O cenário E2E deve ser entregue com seus testes em commit próprio.
- Cada commit deve conter somente as alterações e os testes diretamente relacionados ao requisito atendido.
- Alterações no mecanismo de proxy, nos guards do gateway ou em gerenciamento de sessão não devem ser incluídas nos commits desta especificação.
