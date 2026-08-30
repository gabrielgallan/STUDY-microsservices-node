# Validação de JWT no products-service

## Objetivo

Proteger globalmente as rotas do `products-service` por meio da validação dos tokens JWT emitidos pelo `users-service`, permitindo acesso sem autenticação somente às rotas explicitamente marcadas como públicas e disponibilizando a identidade autenticada durante o processamento da requisição.

## Escopo

Esta especificação cobre as dependências de autenticação JWT, a configuração do secret compartilhado, o módulo de autenticação, a estratégia JWT, o guard global, o decorator de rota pública e o contrato de identidade disponível em `req.user`.

Não fazem parte deste escopo login, registro, emissão ou renovação de tokens, consulta de usuários, validação do status da conta, logout, revogação, sessões, autorização por role, `RoleGuard`, endpoints de autenticação ou qualquer regra de negócio de produtos.

## Requisitos funcionais

### RF-01 — Dependências e módulo de autenticação

- O serviço deve possuir as dependências de integração JWT e Passport compatíveis com as versões usadas pelo `users-service`: módulo JWT do NestJS, módulo Passport do NestJS, Passport e a estratégia Passport JWT, incluindo os tipos necessários ao desenvolvimento.
- Deve existir um `AuthModule` responsável somente pela infraestrutura de validação JWT do `products-service`.
- O módulo deve integrar a configuração de ambiente, Passport e JWT e registrar uma única `JwtStrategy`.
- O módulo não deve possuir controller, serviço de login, serviço de registro nem qualquer operação de emissão de token.
- A organização e o comportamento devem seguir o mesmo padrão adotado pelo `users-service`, sem copiar componentes que pertencem exclusivamente aos fluxos de login e registro.

### RF-02 — Secret compartilhado

- A configuração de ambiente do serviço deve exigir a variável `JWT_SECRET` como string não vazia.
- `JWT_SECRET` não deve possuir valor padrão nem ser versionado no repositório.
- O valor configurado em execução deve ser exatamente o mesmo usado pelo `users-service` para assinar tokens.
- A ausência ou invalidade de `JWT_SECRET` deve impedir a inicialização da aplicação por meio da validação de ambiente já existente.
- O secret não deve aparecer em logs, respostas HTTP ou mensagens de erro.

### RF-03 — Estratégia JWT

- O serviço deve possuir uma `JwtStrategy` integrada ao Passport.
- A estratégia deve extrair o token exclusivamente do header HTTP `Authorization`, usando o esquema Bearer.
- A assinatura deve ser validada com o `JWT_SECRET` disponibilizado pelo módulo de ambiente.
- A expiração declarada no token deve ser respeitada automaticamente.
- O payload aceito deve possuir obrigatoriamente:

| Claim | Tipo | Regra |
| --- | --- | --- |
| `sub` | UUID | Identificador do usuário autenticado |
| `email` | string | Endereço de e-mail válido |
| `role` | enum | Somente `seller` ou `buyer` |

- Tokens com payload ausente ou incompatível com esse contrato devem ser rejeitados.
- Claims adicionais presentes no token não devem ser propagados para a identidade autenticada.
- A validação não deve consultar o banco de dados do `products-service` nem chamar o `users-service`.

### RF-04 — Identidade autenticada

- Depois da validação, a estratégia deve produzir uma identidade contendo somente:

| Campo | Tipo | Origem |
| --- | --- | --- |
| `id` | UUID | Claim `sub` |
| `email` | string | Claim `email` |
| `role` | enum | Claim `role`, limitado a `seller` ou `buyer` |

- A identidade deve ficar disponível em `req.user` durante todo o processamento da rota protegida.
- `req.user` não deve conter senha, hash, token, status, timestamps, claims técnicos ou qualquer outra informação adicional.
- A tipagem da identidade deve poder ser reutilizada por controllers e services futuros.
- Esta especificação não atribui permissões diferentes a sellers e buyers.

### RF-05 — Decorator de rota pública

- O serviço deve possuir um decorator `@Public()` compatível com o padrão do `users-service`.
- O decorator deve marcar controllers ou handlers com o metadata booleano `isPublic`.
- O metadata deve apenas declarar a exceção de autenticação; o decorator não deve validar tokens nem alterar respostas.
- Nenhuma rota de produção deve ser criada somente para utilizar ou testar o decorator nesta etapa.

### RF-06 — Guard de autenticação JWT

- O serviço deve possuir um `JwtAuthGuard` baseado no guard JWT do Passport.
- Antes de exigir autenticação, o guard deve verificar o metadata `isPublic` aplicável ao handler ou ao controller.
- Rotas públicas devem ser executadas sem token e devem ignorar tokens inválidos eventualmente enviados.
- Rotas não públicas devem exigir um Bearer token válido.
- Com token válido, o guard deve preservar em `req.user` a identidade produzida pela estratégia.
- Falhas do Passport ou ausência de uma identidade válida devem ser normalizadas como não autenticadas, sem expor detalhes internos.

### RF-07 — Proteção global

- O `JwtAuthGuard` deve ser registrado como `APP_GUARD` no módulo raiz da aplicação.
- Todas as rotas presentes e futuras devem ser protegidas por padrão, sem declaração individual do guard.
- A única exceção à proteção global deve ser a presença do metadata `isPublic` fornecido por `@Public()`.
- Deve existir somente um guard global responsável pela autenticação JWT.
- Como o scaffold atual não possui endpoints, nenhuma rota de produção precisa ser marcada como pública nesta especificação.

### RF-08 — Falhas de autenticação

- Uma rota protegida deve retornar HTTP `401` quando o header `Authorization` estiver ausente.
- Uma rota protegida deve retornar HTTP `401` quando o header não usar o esquema Bearer ou não contiver um token válido.
- Uma rota protegida deve retornar HTTP `401` para token malformado, expirado, assinado com outro secret ou com claims obrigatórios inválidos.
- Em qualquer falha, o controller protegido não deve ser executado e nenhuma identidade deve ser aceita em `req.user`.
- A resposta não deve revelar o token recebido, o secret compartilhado, o conteúdo rejeitado do payload nem detalhes criptográficos.

### RF-09 — Limites da autenticação

- O `products-service` deve somente validar tokens emitidos pelo `users-service`; não deve expor endpoints de login ou registro.
- Nenhum `RoleGuard`, decorator de roles ou mecanismo global de autorização deve ser criado.
- A role deve ser apenas validada e transportada em `req.user` para uso direto por controllers ou services em especificações futuras.
- Não devem ser criados refresh tokens, cookies de sessão, armazenamento de tokens ou comunicação síncrona com o `users-service`.

## Fluxo esperado

1. Uma requisição chega ao `products-service`.
2. O guard global verifica se o handler ou controller foi marcado com `@Public()`.
3. Se a rota for pública, a requisição segue sem autenticação, mesmo que não exista token ou que o token enviado seja inválido.
4. Se a rota for protegida, o guard exige um token no header `Authorization` com esquema Bearer.
5. A estratégia valida assinatura, expiração e os claims obrigatórios usando o secret compartilhado.
6. Com token válido, `sub`, `email` e `role` são transformados na identidade disponível em `req.user`.
7. O controller protegido é executado normalmente.
8. Com token ausente ou inválido, o fluxo termina em `401` antes da execução do controller.

## Critérios de aceite

1. O manifesto contém as dependências JWT e Passport necessárias, em versões compatíveis com o `users-service`, e o lockfile está atualizado.
2. A aplicação exige `JWT_SECRET` não vazio e falha durante a validação de ambiente quando a variável está ausente ou inválida.
3. O `AuthModule` registra Passport, JWT e uma única `JwtStrategy`, sem controllers ou serviços de login e registro.
4. A `JwtStrategy` obtém o secret exclusivamente da configuração de ambiente validada.
5. Um token não expirado emitido pelo `users-service` com o secret compartilhado e payload válido é aceito.
6. Tokens ausentes, malformados, expirados ou assinados com outro secret são rejeitados com HTTP `401` em rotas protegidas.
7. Tokens sem `sub`, `email` ou `role`, ou com UUID, e-mail ou role inválidos, são rejeitados com HTTP `401`.
8. Para um token válido, `req.user` contém exatamente `id`, `email` e `role`, com valores correspondentes aos claims do token.
9. Claims adicionais e dados sensíveis presentes no payload não são propagados para `req.user`.
10. O decorator `@Public()` define o metadata `isPublic` e pode ser aplicado a handlers e controllers.
11. Uma rota de teste marcada como pública é acessível sem token e continua acessível quando recebe um token inválido.
12. Uma rota de teste não marcada não executa seu controller quando o token está ausente ou inválido.
13. Uma rota de teste não marcada executa normalmente com token válido e recebe a identidade autenticada em `req.user`.
14. O `JwtAuthGuard` está registrado como `APP_GUARD`, deixando protegida por padrão qualquer rota que não possua `isPublic`.
15. Os comportamentos da estratégia, decorator, guard e proteção global são verificáveis sem adicionar endpoints ao código de produção.
16. A validação JWT não realiza consulta ao banco nem chamada ao `users-service`.
17. O serviço não contém endpoints de login ou registro, emissão de tokens, `RoleGuard`, decorator de roles ou autorização baseada em role.
18. A aplicação continua compilando e os testes do scaffold existente continuam passando após a inclusão da autenticação.
