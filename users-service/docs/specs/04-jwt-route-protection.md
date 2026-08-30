# Guards e proteção de rotas com JWT

## Objetivo

Proteger globalmente as rotas do `users-service` com autenticação JWT, mantendo públicas apenas as rotas explicitamente marcadas e disponibilizando a identidade autenticada para os controllers.

## Escopo

Esta especificação cobre a validação de tokens JWT recebidos em requisições HTTP, o guard global de autenticação e a marcação das rotas públicas existentes.

Não fazem parte deste escopo autorização por role, `RoleGuard`, `SessionGuard`, consulta do usuário no banco durante a autenticação, revalidação do status da conta, sessões, refresh tokens, revogação de tokens, logout ou criação de novos endpoints.

## Requisitos funcionais

### RF-01 — Estratégia JWT

- O serviço deve possuir uma `JwtStrategy` integrada ao Passport.
- A estratégia deve extrair o JWT exclusivamente do header HTTP `Authorization` no formato Bearer.
- O valor do header deve conter o prefixo `Bearer` seguido de um token não vazio.
- A estratégia deve validar a assinatura utilizando o mesmo `JWT_SECRET` configurado para a emissão dos tokens de login.
- A expiração declarada no token deve ser respeitada automaticamente.
- Tokens ausentes, malformados, expirados ou assinados com outro secret não devem produzir uma identidade autenticada.
- O payload aceito deve possuir os claims obrigatórios `sub`, `email` e `role` definidos na especificação de login.
- Um token sem os claims obrigatórios ou com valores incompatíveis com o contrato deve ser considerado inválido.
- Esta etapa não deve consultar o banco de dados nem alterar dados do usuário.

### RF-02 — Usuário autenticado da requisição

- Após a validação do token, a estratégia deve produzir um objeto de usuário autenticado contendo somente:

| Campo | Tipo | Origem |
| --- | --- | --- |
| `id` | UUID | Claim `sub` do JWT |
| `email` | string | Claim `email` do JWT |
| `role` | enum | Claim `role`, limitado a `seller` ou `buyer` |

- O objeto deve ficar disponível em `req.user` durante todo o processamento da rota protegida.
- `req.user` não deve conter senha, hash, token, status, timestamps ou qualquer outro claim.
- Requisições públicas não precisam possuir `req.user`.

### RF-03 — Decorator de rota pública

- O serviço deve possuir um decorator `@Public()` para identificar rotas que não exigem autenticação.
- O decorator deve associar à rota o metadata booleano `isPublic`.
- A presença de `isPublic` deve ser a única exceção ao comportamento global de proteção definido nesta especificação.
- O decorator não deve executar autenticação nem alterar a resposta da rota; ele apenas declara que o acesso é público.

### RF-04 — Guard de autenticação JWT

- O serviço deve possuir um `JwtAuthGuard` baseado no guard JWT do Passport.
- Antes de exigir autenticação, o guard deve verificar o metadata `isPublic` da rota solicitada.
- Quando `isPublic` estiver presente e ativo, o guard deve permitir a execução da rota sem exigir ou validar token.
- Uma rota pública deve continuar acessível quando o header `Authorization` estiver ausente ou contiver um token inválido.
- Quando a rota não for pública, o guard deve exigir a autenticação JWT.
- Em uma rota protegida, somente um token válido deve permitir que o controller seja executado.
- O guard deve preservar em `req.user` o objeto autenticado produzido pela estratégia.

### RF-05 — Proteção global

- O `JwtAuthGuard` deve ser registrado como `APP_GUARD` na aplicação.
- Todas as rotas presentes e futuras devem ser protegidas automaticamente, sem necessidade de declarar o guard individualmente em cada controller.
- O comportamento padrão deve ser negar acesso sem autenticação, exceto quando a rota possuir `isPublic`.
- Não deve existir uma segunda configuração global concorrente para autenticação JWT.

### RF-06 — Rotas públicas existentes

- `POST /auth/register` deve ser marcado com `@Public()` e continuar acessível sem token.
- `POST /auth/login` deve ser marcado com `@Public()` e continuar acessível sem token.
- A marcação pública não deve alterar validações, status HTTP, respostas ou regras de negócio já implementadas nessas rotas.
- Nenhuma outra rota deve ser criada ou marcada como pública nesta especificação.

### RF-07 — Falhas de autenticação

- Uma rota protegida deve retornar HTTP `401` quando o token estiver ausente.
- Uma rota protegida deve retornar HTTP `401` quando o header não seguir o formato Bearer esperado.
- Uma rota protegida deve retornar HTTP `401` quando o token estiver expirado, malformado, com assinatura inválida ou com claims obrigatórios inválidos.
- Em qualquer falha, o controller protegido não deve ser executado e `req.user` não deve ser disponibilizado como uma identidade válida.
- A resposta de erro não deve revelar `JWT_SECRET`, conteúdo sensível do token ou detalhes internos da validação criptográfica.

## Fluxo esperado de uma requisição

1. A requisição chega ao `users-service`.
2. O `JwtAuthGuard` verifica o metadata `isPublic` da rota.
3. Se a rota for pública, a requisição segue diretamente para o controller.
4. Se a rota não for pública, o guard exige um JWT Bearer.
5. A `JwtStrategy` valida formato, assinatura, expiração e claims obrigatórios.
6. Com token válido, a estratégia disponibiliza `id`, `email` e `role` em `req.user`.
7. O controller protegido é executado e produz sua resposta normal.
8. Com token inválido ou ausente, o fluxo termina em `401` antes do controller.

## Respostas esperadas para rotas protegidas

### 401 — Não autenticado

- Ocorre quando o token está ausente, expirado, malformado, com assinatura inválida ou com payload incompatível.
- O controller da rota protegida não é executado.
- A resposta não expõe dados sensíveis ou detalhes do token.

### Resposta normal — Token válido

- A rota protegida é executada normalmente.
- O controller recebe a identidade autenticada em `req.user`.
- Status e corpo da resposta continuam sendo definidos pela própria rota.

## Critérios de aceite

1. A aplicação possui uma única `JwtStrategy` registrada no módulo de autenticação e configurada com `JWT_SECRET`.
2. Um JWT válido emitido pelo login é aceito pela estratégia antes do vencimento.
3. A estratégia rejeita tokens expirados, malformados, assinados com outro secret ou sem `sub`, `email` e `role` válidos.
4. Para um token válido, `req.user` contém exatamente `id`, `email` e `role`, com valores correspondentes ao payload.
5. `req.user` nunca contém senha, hash, token ou outros dados da entidade.
6. O decorator `@Public()` define o metadata `isPublic` para a rota marcada.
7. O `JwtAuthGuard` permite uma rota marcada como pública sem header `Authorization`.
8. Uma rota pública permanece acessível mesmo quando recebe um token inválido.
9. Uma rota não pública sem token retorna `401` e não executa seu controller.
10. Uma rota não pública com Bearer token expirado, malformado ou com assinatura inválida retorna `401`.
11. Uma rota não pública com token válido executa normalmente e recebe a identidade em `req.user`.
12. O `JwtAuthGuard` está registrado globalmente por `APP_GUARD`, tornando protegida por padrão qualquer rota sem `isPublic`.
13. `POST /auth/register` continua funcionando sem token e mantém seus contratos atuais.
14. `POST /auth/login` continua funcionando sem token e mantém seus contratos atuais.
15. Os comportamentos do guard e da estratégia são verificáveis sem adicionar endpoints ao código de produção.
16. Nenhum `RoleGuard`, `SessionGuard`, strategy de sessão, novo endpoint ou mecanismo adicional de autenticação é criado.

## Rastreabilidade da implementação

- Cada requisito funcional implementado deve ser entregue em um commit granular próprio.
- Cada commit deve conter somente as alterações e testes diretamente relacionados ao requisito funcional correspondente.
- Alterações de strategy, identidade autenticada, decorator público, guard global, marcação das rotas públicas e tratamento de falhas devem permanecer rastreáveis no histórico.
- Correções necessárias descobertas durante a implementação devem ser separadas dos commits funcionais quando não pertencerem ao mesmo requisito.
