# Consultas essenciais de usuários

## Objetivo

Disponibilizar as consultas mínimas de usuários necessárias ao marketplace, permitindo consultar o perfil autenticado, listar vendedores ativos e obter um usuário específico.

## Escopo

Esta especificação cobre exclusivamente os endpoints `GET /users/profile`, `GET /users/sellers` e `GET /users/:id`, todos protegidos pela autenticação JWT global já existente.

Não fazem parte deste escopo criação, atualização ou exclusão de usuários, listagem geral, paginação, alteração de senha, autenticação adicional, autorização por role ou qualquer novo endpoint.

## Contrato público de usuário

Sempre que um usuário for retornado por um dos endpoints desta especificação, a resposta deve conter somente os dados públicos atuais armazenados no banco:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | UUID | Identificador do usuário |
| `email` | string | E-mail cadastrado |
| `firstName` | string | Primeiro nome |
| `lastName` | string | Sobrenome |
| `role` | enum | Papel do usuário: `seller` ou `buyer` |
| `status` | enum | Situação atual: `active` ou `inactive` |
| `createdAt` | timestamp | Data de criação |
| `updatedAt` | timestamp | Data da última atualização |

O campo `password` nunca deve fazer parte de respostas, inclusive quando estiver vazio, oculto ou contendo o hash.

## Requisitos funcionais

### RF-01 — Estrutura do módulo de usuários

- O `UsersModule` deve possuir um `UsersController` responsável pelos três endpoints definidos nesta especificação.
- O `UsersModule` deve possuir um `UsersService` responsável pelas consultas de usuários no banco.
- O controller e o service devem ser registrados no `UsersModule`.
- O módulo deve continuar disponibilizando o acesso necessário à entidade `User` para os fluxos de autenticação existentes.
- Nenhum dos endpoints deve ser marcado como público.

### RF-02 — Consulta do perfil autenticado

- O serviço deve disponibilizar `GET /users/profile`.
- O endpoint deve identificar o usuário exclusivamente por `req.user.id`, proveniente do JWT validado.
- O endpoint deve buscar o registro no banco a cada requisição para retornar os dados atuais do usuário.
- O e-mail e a role presentes no token não devem substituir os valores atuais armazenados no banco.
- A resposta de sucesso deve retornar um único usuário conforme o contrato público desta especificação.
- A resposta nunca deve conter `password` ou o hash armazenado.

### RF-03 — Listagem de vendedores ativos

- O serviço deve disponibilizar `GET /users/sellers`.
- O endpoint deve retornar todos os usuários que atendam simultaneamente a `role = seller` e `status = active`.
- Compradores, vendedores inativos e quaisquer registros que não satisfaçam ambos os filtros não devem ser retornados.
- Quando não houver vendedores ativos, a resposta deve ser uma lista vazia.
- Cada item deve seguir o contrato público desta especificação e nunca conter `password`.
- A listagem não deve possuir paginação nesta etapa.
- O frontend e outros serviços, incluindo o `products-service`, devem apresentar um JWT válido para acessar o endpoint.

### RF-04 — Consulta de usuário por ID

- O serviço deve disponibilizar `GET /users/:id`.
- O parâmetro `id` representa o UUID do usuário solicitado.
- O endpoint deve buscar o registro correspondente no banco.
- Quando o usuário existir, a resposta deve seguir o contrato público desta especificação.
- Quando nenhum usuário corresponder ao ID informado, o endpoint deve retornar HTTP `404` com indicação de que o usuário não foi encontrado.
- A consulta não deve restringir o resultado por role ou status: usuários `seller` ou `buyer`, ativos ou inativos, podem ser retornados quando encontrados.
- A resposta nunca deve conter `password` ou o hash armazenado.

### RF-05 — Ordem e resolução das rotas

- As rotas estáticas `profile` e `sellers` devem ser declaradas antes da rota dinâmica `:id`.
- Uma chamada a `/users/profile` deve sempre executar a consulta do perfil autenticado.
- Uma chamada a `/users/sellers` deve sempre executar a listagem de vendedores ativos.
- Os segmentos `profile` e `sellers` nunca devem ser interpretados como valores do parâmetro `id`.

### RF-06 — Proteção JWT

- Os três endpoints devem ser protegidos automaticamente pelo `JwtAuthGuard` global existente.
- Uma requisição sem token ou com token inválido deve ser encerrada com HTTP `401` antes da execução do controller.
- Usuários autenticados com role `seller` ou `buyer` podem acessar os três endpoints.
- Esta especificação não deve adicionar `@Public()`, `RoleGuard`, `SessionGuard` ou uma regra adicional de autorização.
- A implementação não deve alterar os contratos de registro, login ou emissão de JWT já existentes.

## Fluxos esperados

### Perfil autenticado

1. A requisição autenticada chega a `GET /users/profile`.
2. O guard global valida o JWT e disponibiliza a identidade em `req.user`.
3. O usuário é consultado no banco pelo valor atual de `req.user.id`.
4. O endpoint retorna os dados públicos atuais, sem `password`.

### Vendedores ativos

1. A requisição autenticada chega a `GET /users/sellers`.
2. O guard global valida o JWT.
3. São consultados somente usuários que sejam vendedores e estejam ativos.
4. O endpoint retorna a lista pública, que pode estar vazia.

### Usuário por ID

1. A requisição autenticada chega a `GET /users/:id`.
2. O guard global valida o JWT.
3. O usuário é consultado pelo UUID informado.
4. O endpoint retorna os dados públicos quando o usuário existe ou `404` quando não existe.

## Respostas esperadas

### 200 — Consulta realizada

- `GET /users/profile` retorna um único objeto de usuário público.
- `GET /users/sellers` retorna uma lista de usuários públicos, incluindo uma lista vazia quando aplicável.
- `GET /users/:id` retorna um único objeto de usuário público quando o registro existe.

### 401 — Não autenticado

- Aplica-se aos três endpoints quando o JWT está ausente ou é inválido.
- O controller não deve ser executado nessa situação.
- O tratamento deve permanecer sob responsabilidade da proteção JWT global existente.

### 404 — Usuário não encontrado

- Aplica-se a `GET /users/:id` quando não existe usuário com o UUID solicitado.
- Esta especificação não exige resposta `404` para a listagem de vendedores, que deve retornar uma lista vazia.

## Critérios de aceite

1. O `UsersModule` registra um `UsersController` e um `UsersService` sem remover o acesso à entidade usado pelo `AuthModule`.
2. Existem exatamente três novos endpoints de produção: `GET /users/profile`, `GET /users/sellers` e `GET /users/:id`.
3. Nenhum dos três endpoints possui metadata pública e todos retornam `401` sem um JWT válido.
4. `GET /users/profile` usa o ID de `req.user` e retorna os valores atuais do registro correspondente no banco.
5. Alterações de e-mail, role, status ou nomes realizadas no banco após a emissão do token são refletidas na resposta de perfil.
6. `GET /users/profile` não utiliza um ID, e-mail ou role fornecido pelo cliente para escolher o usuário.
7. `GET /users/sellers` retorna todos e somente os usuários que sejam simultaneamente `seller` e `active`.
8. `GET /users/sellers` retorna HTTP `200` com lista vazia quando não há vendedores ativos.
9. `GET /users/:id` retorna HTTP `200` para um UUID associado a um usuário existente, independentemente de sua role ou status.
10. `GET /users/:id` retorna HTTP `404` para um UUID sem usuário correspondente.
11. As rotas `profile` e `sellers` são resolvidas como rotas estáticas e não são capturadas por `:id`.
12. Nenhuma resposta de sucesso contém a chave `password`, a senha original ou o hash armazenado.
13. Cada usuário retornado contém somente `id`, `email`, `firstName`, `lastName`, `role`, `status`, `createdAt` e `updatedAt`.
14. Registro, login, emissão de JWT e proteção global mantêm os contratos já existentes.
15. Não são implementados update, delete, listagem geral, paginação, alteração de senha, `RoleGuard`, `SessionGuard` ou endpoints adicionais.

## Rastreabilidade da implementação

- Cada requisito funcional deve ser implementado em commit granular e identificável.
- Cada commit deve conter apenas a implementação e os testes diretamente relacionados ao requisito atendido.
- O lint deve ser executado e aprovado antes de cada commit de implementação.
- Testes dos endpoints devem permanecer separados de alterações externas ao `users-service`.
