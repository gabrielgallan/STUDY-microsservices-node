# Gateway DTOs, validação com Zod e documentação OpenAPI

## Objetivo

Fechar a última lacuna de qualidade da borda: hoje o `api-gateway` valida corpo de requisição apenas nas rotas de autenticação e documenta as demais rotas apenas com um `@ApiOperation` de uma linha, sem tipos de entrada, sem tipos de saída e sem catálogo de erros. Esta entrega leva o padrão já estabelecido no módulo de auth — schema Zod + `createZodDto` enriquecido com exemplos, classe de resposta anotada com `@ApiProperty` e `ZodValidationPipe` aplicado no `@Body` — para **todos** os controllers de proxy do gateway (users, products, checkout e payments), de modo que a referência publicada em `/reference` descreva com precisão o contrato de entrada e de saída de cada rota, incluindo todas as respostas HTTP possíveis.

O gateway continua sendo apenas trânsito: a validação adicionada é de **forma do payload**, não de regra de negócio, e as classes de resposta são **exclusivamente documentais** — nenhuma resposta passa a ser transformada, serializada ou envelopada.

## Escopo

Esta especificação cobre exclusivamente o projeto `api-gateway`, e dentro dele apenas:

- a criação de uma pasta `dtos/` em cada módulo que expõe controller de proxy (`users`, `products`, `checkout`, `payments`);
- a criação de um arquivo de DTO por rota, mais arquivos de representação compartilhada quando a mesma entidade é devolvida por mais de uma rota;
- a criação de schemas Zod de entrada, das classes de requisição via `createZodDto` enriquecidas com `@ApiProperty`, e das classes de resposta anotadas com `@ApiProperty`;
- a aplicação de `new ZodValidationPipe(schema)` no `@Body` das rotas que recebem corpo;
- a inclusão de `@HttpCode()` explícito, `@ApiTags`, `@ApiOperation` e `@ApiResponse` por status HTTP possível em todos os controllers no escopo;
- o complemento da documentação de respostas do `AuthController`, que já possui pipe e DTOs.

**Não** fazem parte deste escopo, e não podem ser alterados: `main.ts`, `app.module.ts`, `swagger.config.ts`, `gateway.config.ts`, os módulos (`*.module.ts`), o `ProxyService`, os serviços de resiliência (circuit breaker, retry, timeout, fallback), os guards (`JwtAuthGuard`, `RoleGuard`, `SessionGuard`, `CustomThrottlerGuard`), as strategies, os decorators, o middleware de log, o `HealthController` do gateway, o `ZodValidationPipe` existente, o `ApiExceptionResponseDto` existente, os arquivos de teste e **qualquer arquivo dos demais projetos** (`users-service`, `products-service`, `checkout-service`, `payments-service`, `messaging-service`).

## Situação atual

| Componente | Situação |
| --- | --- |
| `ZodValidationPipe` (`src/pipes/zod-validation.pipe.ts`) | Implementado; lança `BadRequestException` com `message`, `error` (flatten do Zod) e `statusCode` |
| `ApiExceptionResponseDto` (`src/dtos/api-exeption-response.dto.ts`) | Implementado; expõe `statusCode`, `message` e `error` |
| `AuthController` | `@ApiTags`, `@HttpCode`, pipe no `@Body` e DTOs de entrada/saída já aplicados em `login` e `register` |
| DTOs de auth (`login.dto.ts`, `register.dto.ts`) | Implementados com schema Zod, `createZodDto` e exemplos |
| `PublicUserDto` (`src/users/dtos/profile.dto.ts`) | Implementado; representação pública de usuário compartilhada com o auth |
| `UsersController`, `ProductsController`, `CartProxyController`, `OrdersProxyController`, `PaymentsProxyController` | Possuem `@ApiTags`, `@ApiBearerAuth` e `@ApiOperation`, mas **nenhum** `@ApiResponse`, **nenhum** `@HttpCode` e **nenhum** DTO |
| Corpos de `POST /products`, `POST /cart/items` e `POST /cart/checkout` | Tipados como `Record<string, unknown>` e repassados sem validação |
| Pasta `dtos/` em `products`, `checkout` e `payments` | Não existe |
| Pipe global | **Não existe** no `main.ts`; a validação é sempre local, por rota |

> Observação sobre o pedido original: a rota `POST /auth/register` **já** utiliza o `ZodValidationPipe` com o `registerSchema`. Para essa rota resta apenas completar a documentação de respostas (RF-06).

## Convenções obrigatórias

### C-01 — Organização de arquivos

- Cada módulo com controller de proxy passa a ter uma pasta `dtos/` no seu diretório (`src/products/dtos/`, `src/checkout/dtos/`, `src/payments/dtos/`); `src/users/dtos/` e `src/auth/controllers/dtos/` já existem e são reaproveitados.
- **Um arquivo por rota**, nomeado pela operação em kebab-case (`create-product.dto.ts`, `get-cart.dto.ts`, …).
- Quando a **mesma representação de saída** é devolvida por mais de uma rota do módulo, ela é declarada uma única vez em um arquivo de representação compartilhada (`product.dto.ts`, `cart.dto.ts`, `order.dto.ts`), e cada arquivo de rota declara sua classe de resposta **estendendo** a classe compartilhada, sem acrescentar campos. Isso mantém um arquivo por rota, um nome de schema distinto por operação no OpenAPI e uma única fonte de verdade para os campos.
- Nenhum DTO é declarado dentro de arquivo de controller.

### C-02 — Entrada

- O schema Zod é exportado com o sufixo `Schema` (`createProductSchema`, `addCartItemSchema`, …) e usa `.strict()`.
- A classe de requisição estende `createZodDto(schema)` e **redeclara** cada campo com `@ApiProperty` contendo `example` e, quando útil, `description`, `enum` e `required`, exatamente como já é feito em `login.dto.ts` e `register.dto.ts`.
- O schema do gateway **espelha o contrato do serviço de destino**, com as exceções justificadas em D-01 e D-02.

### C-03 — Saída

- A classe de resposta é declarada manualmente com `@ApiProperty` por campo, com `example` compatível com o payload real do serviço de destino, e tipagem TypeScript manual (`!:`), sem `createZodDto`.
- Campos anuláveis usam `nullable: true`; enumerações usam `enum` com os valores do serviço de destino; datas são documentadas como `string` ISO-8601, que é o formato efetivamente serializado no JSON.
- As classes de resposta são **apenas documentação**: não são instanciadas, não são usadas como tipo de retorno dos métodos do controller e nenhum interceptor de serialização é introduzido. O corpo devolvido pelo serviço de destino continua chegando ao cliente inalterado.

### C-04 — Controllers

Em cada controller no escopo:

- `@ApiTags` no nível da classe (todos já possuem; manter o valor atual);
- `@ApiBearerAuth()` preservado exatamente onde já está declarado hoje — no nível da classe em `users`, `checkout` e `payments`, e apenas no `POST /products` em `products`, cujas rotas de leitura são `@Public()`;
- `@ApiOperation({ summary })` em toda rota, mantendo os resumos atuais;
- `@ApiResponse` para **cada status HTTP possível** da rota, com `status`, `description` curta e `type`: o DTO de resposta nos sucessos (com `isArray: true` quando a rota devolve coleção) e `ApiExceptionResponseDto` em todos os erros;
- `@HttpCode()` explícito com o status **atualmente** produzido pela rota (D-03);
- `@Body(new ZodValidationPipe(schema))` nas rotas que recebem corpo, com o tipo do parâmetro trocado de `Record<string, unknown>` para a classe de requisição correspondente;
- parâmetros de rota documentados com `@ApiParam` (nome, descrição e exemplo). `@ApiParam` é puramente documental e **não** introduz validação.

Nenhuma outra alteração é permitida nos controllers: assinatura de chamada ao `ProxyService`, nome de serviço, método, caminho de destino, headers repassados, identidade repassada, guards e decorators de `@Public()` permanecem exatamente como estão.

## Inventário de rotas e artefatos

### Módulo `auth` — `src/auth/controllers/dtos/` (existente)

| Rota | Sucesso | Arquivo | Entrada | Saída | Erros a documentar |
| --- | --- | --- | --- | --- | --- |
| `POST /auth/login` | 200 | `login.dto.ts` (existente) | `loginSchema` / `LoginDto` | `LoginResponseDto` | 400, 401, 429 |
| `POST /auth/register` | 201 | `register.dto.ts` (existente) | `registerSchema` / `RegisterDto` | `RegisterResponseDto` (estende `PublicUserDto`) | 400, 409, 429 |

Nesse módulo, os schemas, o pipe e as classes de entrada **já existem e não devem ser alterados**. A entrega acrescenta apenas a classe `RegisterResponseDto` e os `@ApiResponse` faltantes.

### Módulo `users` — `src/users/dtos/` (existente)

| Rota | Sucesso | Arquivo | Entrada | Saída | Erros a documentar |
| --- | --- | --- | --- | --- | --- |
| `GET /users/profile` | 200 | `get-profile.dto.ts` | — | `GetProfileResponseDto` (estende `PublicUserDto`) | 401, 404, 429 |
| `GET /users/sellers` | 200 | `get-active-sellers.dto.ts` | — | `GetActiveSellersResponseDto` (estende `PublicUserDto`, `isArray: true`) | 401, 429 |

`profile.dto.ts` e o `PublicUserDto` permanecem inalterados.

### Módulo `products` — `src/products/dtos/` (novo)

Representação compartilhada: `product.dto.ts` → `ProductDto` com `id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt`, `updatedAt`.

| Rota | Sucesso | Arquivo | Entrada | Saída | Erros a documentar |
| --- | --- | --- | --- | --- | --- |
| `GET /products` | 200 | `list-active-products.dto.ts` | — | `ListActiveProductsResponseDto` (`isArray: true`) | 429 |
| `GET /products/seller/:sellerId` | 200 | `list-products-by-seller.dto.ts` | — | `ListProductsBySellerResponseDto` (`isArray: true`) | 400, 429 |
| `GET /products/:id` | 200 | `get-product-by-id.dto.ts` | — | `GetProductByIdResponseDto` | 400, 404, 429 |
| `POST /products` | 201 | `create-product.dto.ts` | `createProductSchema` / `CreateProductDto` | `CreateProductResponseDto` | 400, 401, 403, 429, 500 |

`createProductSchema`: `name` (string, 1–255), `description` (string, mínimo 1), `price` (número finito, mínimo 0.01), `stock` (inteiro, mínimo 0); objeto `.strict()`.

O `403` do `POST /products` corresponde à recusa do `products-service` quando o usuário autenticado não é vendedor. O `400` das rotas de leitura corresponde ao `ParseUUIDPipe` do `products-service`, repassado pelo proxy.

### Módulo `checkout` — `src/checkout/dtos/` (novo)

Representações compartilhadas: `cart.dto.ts` → `CartItemDto` (`id`, `productId`, `productName`, `price`, `quantity`, `subtotal`) e `CartDto` (`id` anulável, `userId`, `status`, `items`, `total`, `createdAt` e `updatedAt` anuláveis); `order.dto.ts` → `OrderDto` (`id`, `userId`, `cartId`, `total`, `status`, `paymentMethod`, `createdAt`, `updatedAt`).

| Rota | Sucesso | Arquivo | Entrada | Saída | Erros a documentar |
| --- | --- | --- | --- | --- | --- |
| `POST /cart/items` | 201 | `add-cart-item.dto.ts` | `addCartItemSchema` / `AddCartItemDto` | `AddCartItemResponseDto` (estende `CartDto`) | 400, 401, 404, 422, 429, 500 |
| `GET /cart` | 200 | `get-cart.dto.ts` | — | `GetCartResponseDto` (estende `CartDto`) | 401, 429, 500 |
| `DELETE /cart/items/:itemId` | 200 | `remove-cart-item.dto.ts` | — | `RemoveCartItemResponseDto` (estende `CartDto`) | 400, 401, 404, 429, 500 |
| `POST /cart/checkout` | 201 | `checkout.dto.ts` | `checkoutSchema` / `CheckoutDto` | `CheckoutResponseDto` (estende `OrderDto`) | 400, 401, 422, 429, 500 |
| `GET /orders` | 200 | `list-orders.dto.ts` | — | `ListOrdersResponseDto` (estende `OrderDto`, `isArray: true`) | 401, 429, 500 |
| `GET /orders/:id` | 200 | `get-order-by-id.dto.ts` | — | `GetOrderByIdResponseDto` (estende `OrderDto`) | 400, 401, 404, 429, 500 |

`addCartItemSchema`: `productId` (UUID), `quantity` (inteiro, mínimo 1); objeto `.strict()`.
`checkoutSchema`: `paymentMethod` (string não vazia — ver D-01); objeto `.strict()`.

O `422` de `POST /cart/items` corresponde a produto indisponível e o de `POST /cart/checkout` a carrinho vazio ou inválido, ambos decididos pelo `checkout-service`.

### Módulo `payments` — `src/payments/dtos/` (novo)

| Rota | Sucesso | Arquivo | Entrada | Saída | Erros a documentar |
| --- | --- | --- | --- | --- | --- |
| `GET /payments/:orderId` | 200 | `get-payment-by-order-id.dto.ts` | — | `GetPaymentByOrderIdResponseDto` | 400, 401, 404, 429, 500 |

`GetPaymentByOrderIdResponseDto`: `id`, `orderId`, `userId`, `amount`, `status` (`pending` \| `approved` \| `rejected`), `paymentMethod`, `transactionId` anulável, `rejectionReason` anulável, `processedAt` anulável, `createdAt`, `updatedAt`. Como o módulo tem uma única rota, não há arquivo de representação compartilhada.

## Catálogo de erros

Todas as respostas de erro são documentadas com `type: ApiExceptionResponseDto`, que é o formato produzido pelo `ZodValidationPipe` do gateway e é compatível com o corpo de erro repassado dos serviços de destino.

| Status | Origem | Onde documentar |
| --- | --- | --- |
| 400 | Validação Zod no gateway; `ParseUUIDPipe` e validações do serviço de destino repassadas pelo proxy | Rotas com corpo e rotas com parâmetro identificador |
| 401 | `JwtAuthGuard` do gateway (ausência de token, token inválido ou expirado) e credenciais inválidas no login | Rotas autenticadas e `POST /auth/login` |
| 403 | Recusa de autorização do serviço de destino | `POST /products` |
| 404 | Recurso inexistente no serviço de destino | Rotas de consulta por identificador e remoção de item |
| 409 | E-mail já registrado | `POST /auth/register` |
| 422 | Regra de negócio do `checkout-service` | `POST /cart/items` e `POST /cart/checkout` |
| 429 | `CustomThrottlerGuard` global e `@Throttle` das rotas de auth | Todas as rotas |
| 500 | Fallback de erro do proxy quando o serviço de destino está indisponível | Rotas de `checkout`, `payments` e `POST /products` |

O `500` **não** é documentado nas rotas de `users`, `auth` e nas leituras de `products`: nesses caminhos o proxy usa fallback de cache e responde `200` com dado em cache ou com o payload padrão do fallback, em vez de propagar erro. Ver "Limitação conhecida".

## Requisitos funcionais

### RF-01 — Pastas e arquivos de DTO

- Devem existir as pastas `src/products/dtos/`, `src/checkout/dtos/` e `src/payments/dtos/`, além das já existentes `src/users/dtos/` e `src/auth/controllers/dtos/`.
- Deve existir exatamente um arquivo de DTO por rota, conforme o inventário, mais os arquivos de representação compartilhada `product.dto.ts`, `cart.dto.ts` e `order.dto.ts`.
- Nenhum DTO pode ser declarado fora dessas pastas, e nenhum arquivo de DTO existente pode ser movido ou renomeado.

### RF-02 — Schemas de entrada

- Cada rota que recebe corpo deve ter um schema Zod exportado no seu arquivo de DTO, com objeto `.strict()`.
- Os schemas devem espelhar o contrato do serviço de destino, com as exceções descritas em D-01 e D-02.
- Os schemas devem ser exportados nomeadamente, para poderem ser instanciados no `@Body` do controller.
- Nenhum schema pode carregar regra de negócio (disponibilidade de produto, propriedade de carrinho, papel do usuário, limite de crédito): a decisão continua sendo do serviço de destino.

### RF-03 — Classes de entrada

- Cada schema deve ter uma classe correspondente estendendo `createZodDto(schema)`.
- Cada campo da classe deve ser redeclarado com `@ApiProperty`, com `example` realista e, quando aplicável, `description` e `enum`.
- Os exemplos devem ser coerentes entre si e com os exemplos das classes de resposta do mesmo módulo.

### RF-04 — Classes de resposta

- Cada rota que devolve corpo deve ter uma classe de resposta declarada no arquivo de DTO da rota, com todos os campos anotados com `@ApiProperty` e tipados manualmente.
- Quando a representação é compartilhada por mais de uma rota do módulo, a classe da rota deve estender a classe compartilhada, sem redeclarar campos.
- Coleções devem ser documentadas com `isArray: true` no `@ApiResponse`, e não com uma classe de envelope.
- As classes de resposta não podem alterar o corpo devolvido ao cliente: são exclusivamente metadados de documentação.

### RF-05 — Controllers de proxy

- Os controllers `UsersController`, `ProductsController`, `CartProxyController`, `OrdersProxyController` e `PaymentsProxyController` devem receber `@ApiOperation`, `@ApiResponse` por status possível, `@ApiParam` para parâmetros de rota e `@HttpCode()` explícito, conforme C-04 e o inventário.
- As rotas com corpo (`POST /products`, `POST /cart/items`, `POST /cart/checkout`) devem passar a validar via `@Body(new ZodValidationPipe(schema))` e a tipar o parâmetro com a classe de requisição.
- O objeto repassado ao `ProxyService` nessas rotas passa a ser o **valor saneado pelo schema** (com `trim` aplicado onde o schema o define), e não mais o corpo bruto.
- Nenhuma chamada ao `ProxyService` pode ter serviço, método, caminho, headers ou identidade alterados.

### RF-06 — Documentação do AuthController

- `POST /auth/login` deve documentar `401` (credenciais inválidas ou conta inativa) e `429` (limite de requisições), além do `200` e do `400` já documentados.
- `POST /auth/register` deve documentar `409` (e-mail já registrado) e `429`, além do `201` e do `400` já documentados, e passar a referenciar a classe `RegisterResponseDto` declarada em `register.dto.ts`.
- O schema, a classe de entrada, o pipe, o `@HttpCode` e os decorators de `@Throttle` do `AuthController` não podem ser alterados.

### RF-07 — Preservação de comportamento

- Os códigos de status de sucesso de todas as rotas devem permanecer idênticos aos atuais.
- A ordem de execução guard → pipe deve continuar garantindo que uma requisição sem token receba `401` antes de qualquer validação de corpo, e que nesse caso o proxy não seja acionado.
- As rotas públicas (`GET /products`, `GET /products/seller/:sellerId`, `GET /products/:id` e todo o `AuthController`) devem continuar públicas.
- Nenhum arquivo de configuração, bootstrap, módulo, guard, pipe, serviço de resiliência, middleware ou teste pode ser alterado.
- Nenhum arquivo fora do `api-gateway` pode ser alterado.

### RF-08 — Suíte existente

- A suíte de testes do gateway (`pnpm test:e2e`) deve continuar passando sem alteração dos arquivos de teste.
- Em particular, o teste que verifica que o gateway **encaminha um método de pagamento inválido em vez de recusá-lo** deve continuar passando (ver D-01), assim como os testes de roteamento que afirmam o repasse do corpo intacto para `POST /cart/items` e `POST /products`.

## Decisões de projeto

### D-01 — `paymentMethod` validado como string, não como enum

O `checkout-service` restringe `paymentMethod` a `credit_card`, `debit_card`, `pix` e `boleto`. Reproduzir esse enum no gateway seria a tradução literal do contrato, mas quebraria uma decisão de arquitetura já firmada e coberta por teste: o gateway **encaminha** o método de pagamento e deixa a recusa para o dono da regra, evitando que o catálogo de meios de pagamento precise ser alterado em dois projetos a cada mudança.

Portanto o `checkoutSchema` valida `paymentMethod` como string não vazia — o suficiente para garantir corpo bem formado — e os valores aceitos aparecem na documentação através de `description` e `example` na classe `CheckoutDto`, sem `enum` no schema Zod. Um valor desconhecido continua sendo repassado e recusado pelo `checkout-service`, com o erro chegando ao cliente com status e mensagem originais.

### D-02 — Preço sem `multipleOf` no gateway

O `products-service` exige preço múltiplo de `0.01`. No gateway o `createProductSchema` valida apenas número finito com mínimo `0.01`: a precisão em centavos continua sendo verificada pelo dono do dado, evitando divergência de arredondamento entre as duas validações. O requisito de duas casas decimais é comunicado na `description` do campo.

### D-03 — `@HttpCode` explícito preserva os status atuais

`@HttpCode()` é adicionado apenas para tornar explícito o status que a rota **já** produz: `201` nos `POST` de criação (`/products`, `/cart/items`, `/cart/checkout`), `200` nos `GET` e `200` no `DELETE`. Nenhum status de sucesso muda. Em particular, `POST /cart/items` e `POST /cart/checkout` permanecem em `201`, ainda que devolvam representações de carrinho e pedido, porque a suíte existente e os clientes já dependem desse valor.

### D-04 — `.strict()` nos schemas de corpo

Os schemas usam `.strict()`, alinhados aos schemas dos serviços de destino, que também são estritos. Consequência: um corpo com campo desconhecido passa a ser recusado com `400` **no gateway**, em vez de percorrer a rede e ser recusado com `400` pelo serviço de destino. O status final visto pelo cliente é o mesmo; o que muda é o formato do corpo do erro, que passa a ser o do `ZodValidationPipe` do gateway.

### D-05 — Validação de parâmetros de rota fora de escopo

Identificadores em `:id`, `:sellerId`, `:itemId` e `:orderId` continuam **não** sendo validados no gateway: o formato é decidido pelo serviço de destino, que já responde `400` para UUID inválido, e essa decisão foi firmada na especificação anterior. `@ApiParam` documenta o formato esperado sem introduzir validação.

## Restrições e fora de escopo

- Não introduzir pipe global no `main.ts` nem `APP_PIPE` no `app.module.ts`: a validação permanece local, declarada rota a rota.
- Não alterar o `ZodValidationPipe` nem o `ApiExceptionResponseDto` existentes.
- Não substituir o `ZodValidationPipe` local pelo pipe do pacote `nestjs-zod`.
- Não introduzir interceptors de serialização, `ClassSerializerInterceptor`, filtros de exceção ou transformação de resposta.
- Não alterar `swagger.config.ts`: as tags necessárias já estão declaradas.
- Não criar, remover ou renomear rotas, nem alterar caminhos, métodos, guards ou decorators de visibilidade.
- Não alterar arquivos de teste, nem criar novos testes nesta entrega.
- Não alterar `package.json`, `tsconfig`, configuração do Biome ou variáveis de ambiente.
- Não alterar nada nos projetos `users-service`, `products-service`, `checkout-service`, `payments-service` e `messaging-service`.
- Não documentar no gateway rotas que ele não expõe (DLQ, métricas, `GET /users/:id`).

## Critérios de aceite

1. O `api-gateway` compila sem erros e sem avisos de tipo após a entrega.
2. `pnpm test:e2e` do gateway passa integralmente, sem qualquer alteração nos arquivos de teste.
3. Existem as pastas `src/products/dtos/`, `src/checkout/dtos/` e `src/payments/dtos/`, e nenhum DTO foi declarado fora de uma pasta `dtos/`.
4. Existe exatamente um arquivo de DTO por rota do inventário, além dos arquivos de representação compartilhada `product.dto.ts`, `cart.dto.ts` e `order.dto.ts`.
5. Nenhum arquivo de DTO preexistente foi movido, renomeado ou teve campos removidos, e `PublicUserDto` continua em `src/users/dtos/profile.dto.ts` com a mesma forma.
6. Cada rota que recebe corpo tem schema Zod `.strict()` exportado no arquivo de DTO da rota.
7. Cada schema tem classe de requisição estendendo `createZodDto`, com todos os campos redeclarados com `@ApiProperty` e `example`.
8. Cada rota que devolve corpo tem classe de resposta com todos os campos anotados com `@ApiProperty`, incluindo `nullable: true` nos anuláveis e `enum` nos enumerados.
9. As classes de resposta de rotas que compartilham representação estendem a classe compartilhada sem redeclarar campos.
10. Rotas de coleção documentam a saída com `isArray: true`.
11. Todos os controllers no escopo têm `@ApiTags`, e os `@ApiBearerAuth` continuam exatamente nas mesmas posições de antes.
12. Toda rota tem `@ApiOperation({ summary })`, com os resumos atuais preservados.
13. Toda rota tem `@ApiResponse` para cada status possível segundo o inventário e o catálogo de erros, com `description` e `type`.
14. Todo `@ApiResponse` de erro usa `ApiExceptionResponseDto` como `type`.
15. Toda rota tem `@HttpCode()` explícito, com o mesmo status de sucesso produzido antes da entrega.
16. `POST /products`, `POST /cart/items` e `POST /cart/checkout` aplicam `new ZodValidationPipe(schema)` no `@Body` e tipam o parâmetro com a classe de requisição, sem `Record<string, unknown>`.
17. `POST /products` com corpo válido continua acionando o proxy com serviço `products`, método `post`, caminho `/products`, o corpo, o header `Authorization` e a identidade autenticada.
18. `POST /cart/items` com corpo válido continua acionando o proxy com serviço `checkout`, método `post`, caminho `/cart/items`, o corpo, o header `Authorization` e a identidade autenticada.
19. `POST /cart/checkout` com `paymentMethod` desconhecido continua sendo **encaminhado** ao `checkout-service`, com status de sucesso `201`, e não é recusado pelo gateway.
20. Um corpo malformado nessas três rotas é recusado com `400` no gateway, no formato do `ApiExceptionResponseDto`, e o proxy não é acionado.
21. Uma requisição sem token em rota autenticada continua respondendo `401` antes de qualquer validação de corpo, e o proxy não é acionado.
22. As rotas públicas de produtos e todo o `AuthController` continuam públicos.
23. `POST /auth/login` documenta `200`, `400`, `401` e `429`; `POST /auth/register` documenta `201`, `400`, `409` e `429` e referencia `RegisterResponseDto`.
24. O schema, a classe de entrada, o pipe, o `@HttpCode` e os `@Throttle` do `AuthController` permanecem inalterados.
25. Os parâmetros de rota são documentados com `@ApiParam` e continuam sem validação no gateway.
26. As chamadas ao `ProxyService` mantêm serviço, método, caminho de destino, headers e identidade idênticos aos atuais em todas as rotas.
27. Nenhuma resposta de sucesso é transformada, envelopada ou serializada pelo gateway; o corpo do serviço de destino chega inalterado.
28. Não existe pipe global no `main.ts` nem `APP_PIPE` no `app.module.ts`.
29. `main.ts`, `app.module.ts`, `swagger.config.ts`, `gateway.config.ts`, os `*.module.ts`, o `ProxyService`, os serviços de resiliência, os guards, as strategies, os decorators, o middleware, o `HealthController`, o `ZodValidationPipe` e o `ApiExceptionResponseDto` permanecem inalterados.
30. `git status` mostra alterações apenas em arquivos de controller dentro do escopo, em arquivos de DTO e nas novas pastas `dtos/` — nenhum arquivo de outro projeto foi tocado.
31. A referência publicada em `/reference` mostra, para cada rota, o schema de entrada com exemplos, o schema de saída e a lista completa de respostas HTTP documentadas.
32. As rotas continuam agrupadas nas tags `Authentication`, `Users`, `Products`, `Checkout` e `Payments` já declaradas, sem tags novas.

## Limitação conhecida

A documentação de erros descreve o comportamento **atual** do proxy, que não é uniforme entre serviços: a indisponibilidade de `checkout`, `payments` e do `POST /products` produz `500`, enquanto a de `users`, do `auth` e das leituras de produtos cai em fallback de cache e responde `200` — com dado possivelmente desatualizado ou, na ausência de cache, com o payload padrão do fallback. Um `503` devolvido por um serviço de destino também é convertido em `500` pelo gateway, porque o `validateStatus` do proxy só considera `2xx` e `4xx` como resposta legítima.

Uniformizar esse comportamento — respondendo `503` com corpo previsível em toda indisponibilidade e sinalizando explicitamente respostas servidas de cache — exige alterar o `ProxyService` e os serviços de fallback, o que está fora do escopo desta especificação e deve ser tratado separadamente. Enquanto isso, a documentação reflete o que o gateway realmente faz, e não o que seria desejável que fizesse.
