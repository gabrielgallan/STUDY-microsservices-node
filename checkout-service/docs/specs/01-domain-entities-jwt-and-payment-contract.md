# Domain entities, JWT authentication and payment contract

## Objetivo

Disponibilizar a base de domínio do `checkout-service` para persistir carrinhos, itens e pedidos, proteger globalmente o serviço por meio da validação dos tokens JWT emitidos pelo `users-service` e tornar confiável o contrato da mensagem de pagamento já existente. A entrega também deve fornecer um health check público e documentação Swagger básica, preparando o serviço para as operações de checkout que serão definidas em especificações futuras.

## Escopo

Esta especificação cobre exclusivamente:

- as entidades TypeORM `Cart`, `CartItem` e `Order`;
- os módulos de domínio `CartModule` e `OrdersModule`;
- o contrato, a validação e a compatibilidade da mensagem enviada para pagamento;
- a infraestrutura de validação JWT do `checkout-service`;
- a proteção global das rotas e o mecanismo para declarar rotas públicas;
- o endpoint público de saúde;
- a configuração básica do Swagger;
- o registro desses componentes no módulo raiz.

Não fazem parte deste escopo endpoints ou operações CRUD de carrinhos, itens ou pedidos, DTOs de negócio, regras gerais de cálculo, validação de estoque ou produtos, processamento financeiro, autorização por role, login, registro, emissão ou renovação de tokens e integrações adicionais entre serviços.

O `EventsModule` e a topologia RabbitMQ existente devem permanecer inalterados. São permitidos somente ajustes compatíveis no contrato e na validação da mensagem de pagamento, conforme os requisitos desta especificação.

## Estrutura de dados

### Entidade Cart

A entidade `Cart` deve representar um carrinho pertencente a um usuário e conter exatamente os seguintes campos e relações:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `userId` | UUID | Obrigatório; identifica o usuário no `users-service`, sem relação TypeORM ou chave estrangeira para outro banco |
| `status` | enum | Obrigatório; aceita somente `active`, `completed` ou `abandoned`; padrão `active` |
| `total` | decimal | Obrigatório; precisão 10, escala 2 e padrão `0` |
| `items` | relação um-para-muitos | Relação com `CartItem`, com persistência em cascata e carregamento eager |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Preenchido automaticamente na criação e atualizado a cada alteração |

### Entidade CartItem

A entidade `CartItem` deve representar um item pertencente a um carrinho e conter exatamente os seguintes campos e relações:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `cart` | relação muitos-para-um | Relação obrigatória com `Cart`; a remoção do carrinho deve remover seus itens em cascata no banco |
| `cartId` | UUID | Obrigatório; chave estrangeira correspondente à relação `cart` |
| `productId` | UUID | Obrigatório; identifica o produto no `products-service`, sem relação TypeORM ou chave estrangeira para outro banco |
| `productName` | varchar | Obrigatório; limite de 255 caracteres |
| `price` | decimal | Obrigatório; precisão 10 e escala 2 |
| `quantity` | int | Obrigatório; padrão `1` |
| `subtotal` | decimal | Obrigatório; precisão 10 e escala 2 |
| `createdAt` | timestamp | Preenchido automaticamente na criação |

### Entidade Order

A entidade `Order` deve representar o pedido gerado a partir de um carrinho e conter exatamente os seguintes campos:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `userId` | UUID | Obrigatório; identifica o usuário no `users-service`, sem relação TypeORM ou chave estrangeira para outro banco |
| `cartId` | UUID | Obrigatório; identifica o carrinho de origem, sem relação TypeORM ou chave estrangeira nesta especificação |
| `total` | decimal | Obrigatório; precisão 10 e escala 2 |
| `status` | enum | Obrigatório; aceita somente `pending`, `paid`, `failed` ou `cancelled`; padrão `pending` |
| `paymentMethod` | varchar | Obrigatório; limite de 50 caracteres |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Preenchido automaticamente na criação e atualizado a cada alteração |

Nenhuma das três entidades deve receber campos, relações, chaves estrangeiras ou comportamentos de persistência adicionais nesta etapa.

## Contrato da mensagem de pagamento

A mensagem publicada com uma ordem de pagamento deve manter o formato já reconhecido pelo `checkout-service` e pelo `payments-service`. Nenhum campo existente deve ser renomeado ou removido e nenhum novo campo obrigatório deve ser introduzido.

| Campo da mensagem | Origem | Regras |
| --- | --- | --- |
| `orderId` | `Order.id` | Obrigatório; UUID |
| `userId` | `Order.userId` | Obrigatório; UUID |
| `amount` | `Order.total` | Obrigatório; número finito, positivo, com no máximo duas casas decimais e compatível com a precisão 10, escala 2 |
| `items` | `Cart.items`, obtido a partir de `Order.cartId` | Obrigatório; deve conter ao menos um item |
| `items[].productId` | `CartItem.productId` | Obrigatório; UUID |
| `items[].quantity` | `CartItem.quantity` | Obrigatório; inteiro positivo |
| `items[].price` | `CartItem.price` | Obrigatório; número finito, positivo, com no máximo duas casas decimais e compatível com a precisão 10, escala 2 |
| `paymentMethod` | `Order.paymentMethod` | Obrigatório; string não vazia com no máximo 50 caracteres |
| `description` | Informação complementar, quando disponível | Opcional; não deve ser exigido pelo consumidor |
| `createdAt` | `Order.createdAt` | Opcional na entrada para preservar compatibilidade; quando informado, deve ser uma data e hora ISO 8601 válida |
| `metadata.service` | Serviço publicador | Presente na mensagem publicada; valor `checkout-service` |
| `metadata.timestamp` | Instante da publicação | Presente na mensagem publicada; data e hora ISO 8601 válida |

`Order.cartId`, `Order.status`, `CartItem.productName` e `CartItem.subtotal` não devem ser incluídos na mensagem, pois não são necessários para o processamento do pagamento. A ausência desses campos não representa perda do vínculo do pagamento, que deve utilizar `orderId` como identificador de correlação.

Os valores decimais persistidos nas entidades devem ser normalizados para o contrato numérico da mensagem antes da publicação. A mensagem não deve expor a representação textual que o driver do banco possa utilizar para colunas decimais.

## Requisitos funcionais

### RF-01 — Módulos de domínio

- Deve existir um `CartModule` responsável pelas entidades `Cart` e `CartItem`.
- O `CartModule` deve registrar `Cart` e `CartItem` no TypeORM e disponibilizar os respectivos repositórios para funcionalidades futuras do próprio módulo.
- Deve existir um `OrdersModule` responsável pela entidade `Order`.
- O `OrdersModule` deve registrar `Order` no TypeORM e disponibilizar seu repositório para funcionalidades futuras do próprio módulo.
- Nenhum dos dois módulos deve declarar controllers, endpoints, services de negócio ou operações CRUD nesta especificação.

### RF-02 — Contrato JWT compartilhado

- O `checkout-service` deve validar tokens emitidos pelo `users-service` com o mesmo `JWT_SECRET` usado na assinatura.
- A variável `JWT_SECRET` deve ser obrigatória, ser uma string não vazia, não possuir valor padrão e não ser exposta em logs ou respostas HTTP.
- A ausência ou invalidade de `JWT_SECRET` deve impedir a inicialização da aplicação por meio da validação de ambiente existente.
- O payload aceito deve conter obrigatoriamente:

| Claim | Tipo | Regra |
| --- | --- | --- |
| `sub` | UUID | Identificador do usuário autenticado |
| `email` | string | Endereço de e-mail válido |
| `role` | enum | Somente `seller` ou `buyer` |

- A autenticação não deve consultar o banco de dados nem chamar o `users-service`.

### RF-03 — AuthModule e estratégia JWT

- Deve existir um `AuthModule` dedicado exclusivamente à validação JWT, seguindo o mesmo contrato e comportamento do `products-service`.
- O módulo deve integrar a configuração de ambiente, Passport e JWT e registrar uma única `JwtStrategy`.
- A `JwtStrategy` deve extrair o token exclusivamente do header HTTP `Authorization` com esquema Bearer.
- A estratégia deve validar a assinatura com o `JWT_SECRET`, respeitar a expiração do token e rejeitar payloads que não atendam ao contrato definido no RF-02.
- Depois da validação, `req.user` deve conter somente `id`, `email` e `role`, sendo `id` derivado de `sub`.
- Claims adicionais do token não devem ser propagados para `req.user`.
- O `AuthModule` não deve possuir controllers, endpoints ou recursos de emissão de tokens.

### RF-04 — Proteção global e rotas públicas

- Deve existir um `JwtAuthGuard` compatível com a estratégia JWT e com o padrão adotado pelo `products-service`.
- O guard deve ser registrado como guard global por meio de `APP_GUARD`, deixando protegidas por padrão todas as rotas presentes e futuras.
- Deve existir um decorator `@Public()` que marque handlers ou controllers com o metadata booleano `isPublic`.
- O guard global deve permitir a execução de rotas marcadas com `@Public()` sem exigir token, inclusive quando a requisição trouxer um token inválido.
- Rotas não marcadas como públicas devem responder com HTTP `401` quando o token estiver ausente, malformado, expirado, assinado com outro secret ou possuir claims obrigatórios inválidos.
- Falhas de autenticação não devem expor o token, o secret, o payload rejeitado ou detalhes criptográficos.
- A rota de teste já existente não deve ser tornada pública e deve ficar sujeita à proteção global.
- Esta especificação não deve introduzir `RoleGuard`, decorator de roles nem regras de autorização diferentes para sellers e buyers.

### RF-05 — Health check público

- Deve existir o endpoint `GET /health`.
- O endpoint deve ser explicitamente público por meio de `@Public()`.
- Uma chamada bem-sucedida deve responder com HTTP `200` e o corpo JSON exato:

  `{"status":"ok","service":"checkout-service"}`

- O endpoint não deve consultar banco de dados, RabbitMQ ou outros serviços para produzir a resposta.

### RF-06 — Swagger básico

- O serviço deve possuir as dependências necessárias para gerar documentação OpenAPI compatível com a versão atual do NestJS, com manifesto e lockfile consistentes.
- O bootstrap da aplicação deve disponibilizar a interface Swagger em `/api`.
- A documentação deve possuir o título `Checkout Service`, versão `1.0` e definição de autenticação HTTP Bearer no formato JWT.
- O endpoint de health check deve aparecer na documentação agrupado como saúde.
- A inclusão do Swagger não deve criar endpoints de domínio adicionais.

### RF-07 — Registro no AppModule

- O módulo raiz deve registrar `CartModule`, `OrdersModule`, `AuthModule` e o componente responsável pelo health check, preservando os módulos e a configuração já existentes.
- O módulo raiz deve registrar exatamente um `JwtAuthGuard` como `APP_GUARD`.
- A conexão TypeORM existente deve reconhecer as três novas entidades e criar suas tabelas de acordo com a política de sincronização já configurada para o ambiente.
- O `EventsModule` deve continuar registrado sem qualquer modificação em seu conteúdo ou comportamento.

### RF-08 — Validação da mensagem antes da publicação

- Toda mensagem deve ser validada em runtime antes de chegar ao RabbitMQ, independentemente de qual fluxo de publicação existente seja utilizado.
- A validação deve aplicar todas as regras da seção "Contrato da mensagem de pagamento", incluindo UUIDs, valores monetários, quantidade inteira, lista não vazia, limite do meio de pagamento e datas.
- Uma mensagem inválida não deve ser publicada e deve produzir uma falha controlada para o chamador.
- O fluxo de publicação segura existente deve efetivamente executar a validação, sem manter caminhos que permitam publicar uma mensagem inválida acidentalmente.
- A mensagem publicada deve preservar os dados de negócio validados e receber os metadados técnicos definidos no contrato.
- Quando `createdAt` for fornecido pelo fluxo de pedido, seu valor deve ser preservado. Quando um chamador legado omitir o campo, o comportamento atual de preenchimento automático deve continuar funcionando.
- O fixture da rota de teste existente deve ser ajustado para representar uma mensagem válida, sem alterar a URL, o método HTTP ou o formato da resposta dessa rota.

### RF-09 — Validação no consumidor

- O `payments-service` deve validar em runtime o contrato completo da mensagem antes de iniciar seu processamento.
- A validação do consumidor deve aplicar regras equivalentes às regras do publicador, inclusive sobre cada item.
- Mensagens inválidas devem ser rejeitadas pelo fluxo de consumo e seguir o tratamento de falha, retry e dead-letter já existente, sem serem contabilizadas como pagamentos processados com sucesso.
- A validação não deve alterar a lógica financeira do `payments-service` nem introduzir novas operações de pagamento.
- Os contratos mantidos pelo publicador e pelo consumidor devem permanecer semanticamente equivalentes e ser verificáveis por testes de contrato, evitando divergência silenciosa entre os serviços.

### RF-10 — Compatibilidade da integração existente

- Devem ser preservados os nomes e tipos TypeScript dos campos existentes de `PaymentOrderMessage`.
- `description`, `createdAt` e `metadata` devem continuar opcionais para os chamadores da API de publicação existente.
- Devem ser preservados os métodos públicos existentes do serviço de publicação, sem renomear, remover ou alterar seus parâmetros.
- Devem permanecer inalterados o exchange `payments`, a routing key `payment.order`, a fila `payment_queue` e o formato de serialização JSON.
- O `EventsModule`, seus providers e exports devem permanecer inalterados.
- O endurecimento da validação pode rejeitar entradas que nunca atenderam ao contrato de domínio, mas não deve rejeitar mensagens válidas aceitas pelo formato atual.
- A inclusão da confiabilidade da mensagem não deve criar endpoints novos nem antecipar o fluxo CRUD ou a orquestração de checkout de especificações futuras.

## Fluxo de autenticação esperado

1. Uma requisição chega ao `checkout-service`.
2. O guard global verifica se o handler ou controller foi declarado público.
3. Em uma rota pública, a requisição segue sem autenticação.
4. Em uma rota protegida, o guard exige um Bearer token.
5. A estratégia valida assinatura, expiração e claims obrigatórios com o secret compartilhado.
6. Com um token válido, a identidade normalizada fica disponível em `req.user` e a rota pode ser executada.
7. Com um token ausente ou inválido, a requisição termina com HTTP `401` antes da execução do controller.

## Restrições e fora de escopo

- Não criar endpoints de criação, leitura, atualização ou remoção para `Cart`, `CartItem` ou `Order`.
- Não criar DTOs, services ou regras de negócio apenas para exercitar as entidades.
- Não calcular nem recalcular automaticamente `total` ou `subtotal` nesta etapa.
- Não validar existência de usuários ou produtos em outros serviços.
- Não criar relação TypeORM entre `Order.cartId` e `Cart`.
- Não emitir, renovar, revogar ou armazenar tokens.
- Não adicionar autorização por role.
- Não modificar o `EventsModule`, seus providers, exports ou a topologia RabbitMQ.
- Não renomear ou remover campos da mensagem de pagamento nem adicionar campos obrigatórios.
- Não alterar o processamento financeiro, a política de retry ou a dead-letter queue do `payments-service`; somente garantir que mensagens inválidas entrem no fluxo de falha já existente.

## Critérios de aceite

1. O projeto compila sem erros após a inclusão das entidades, módulos, autenticação, health check e Swagger.
2. O manifesto e o lockfile contêm de forma consistente todas as dependências necessárias para JWT, Passport e Swagger.
3. Os metadados TypeORM de `Cart` apresentam exatamente os campos, tipos, precisão, escala, padrões, timestamps e relação definidos nesta especificação.
4. Os metadados TypeORM de `CartItem` apresentam exatamente os campos, tipos, limites, precisão, escala, padrão, timestamp, chave estrangeira e relação definidos nesta especificação.
5. Os metadados TypeORM de `Order` apresentam exatamente os campos, tipos, limites, precisão, escala, padrão e timestamps definidos nesta especificação.
6. Um `Cart` criado sem status e total informados recebe `active` e `0`, e um `CartItem` criado sem quantidade informada recebe `1`.
7. Uma `Order` criada sem status informado recebe `pending`.
8. A remoção de um `Cart` remove seus `CartItem` associados por cascata no banco.
9. O carregamento de um `Cart` inclui seus `items` sem exigir carregamento explícito da relação.
10. `CartModule` registra `Cart` e `CartItem` com `TypeOrmModule.forFeature`, e `OrdersModule` registra `Order` com `TypeOrmModule.forFeature`.
11. Nenhum módulo de domínio introduz controller, endpoint CRUD, DTO ou regra de negócio.
12. A aplicação não inicia quando `JWT_SECRET` está ausente ou vazio.
13. Um token não expirado, assinado pelo `users-service` com o secret compartilhado e com payload válido é aceito em uma rota protegida.
14. Tokens ausentes, malformados, expirados, assinados com outro secret ou com `sub`, `email` ou `role` inválidos resultam em HTTP `401` em uma rota protegida.
15. Para um token válido, `req.user` contém exatamente `id`, `email` e `role`, com valores correspondentes a `sub`, `email` e `role` do payload.
16. Uma rota marcada com `@Public()` responde sem token e também quando recebe um token inválido.
17. Qualquer rota não marcada como pública fica protegida pelo único `JwtAuthGuard` registrado globalmente como `APP_GUARD`.
18. `GET /health` responde com HTTP `200` e exatamente `{"status":"ok","service":"checkout-service"}` sem token e sem depender do estado do banco, RabbitMQ ou outros serviços.
19. A interface Swagger está acessível em `/api`, identifica a API como `Checkout Service` versão `1.0`, declara autenticação Bearer JWT e documenta o health check.
20. `CartModule`, `OrdersModule`, `AuthModule` e o health check estão registrados no `AppModule`, junto aos componentes preexistentes.
21. Não existem endpoints de login, registro, emissão de token ou CRUD de carrinhos, itens e pedidos decorrentes desta entrega.
22. Não existem `RoleGuard`, decorator de roles, autorização baseada em role nem chamadas ao `users-service` durante a validação JWT.
23. O `EventsModule`, seus providers e exports permanecem inalterados, assim como exchange, routing key, fila e serialização da integração RabbitMQ.
24. O formato da mensagem continua contendo `orderId`, `userId`, `amount`, `items`, `paymentMethod` e os campos opcionais preexistentes, sem renomear ou remover campos e sem introduzir um novo campo obrigatório.
25. `orderId`, `userId` e cada `items[].productId` que não sejam UUIDs válidos fazem a validação falhar antes da publicação.
26. `amount` e cada `items[].price` que sejam zero, negativos, não finitos, excedam duas casas decimais ou a precisão definida fazem a validação falhar antes da publicação.
27. Uma lista `items` vazia e uma quantidade zero, negativa, fracionária ou não finita fazem a validação falhar antes da publicação.
28. `paymentMethod` vazio ou com mais de 50 caracteres e datas fora do formato ISO 8601 fazem a validação falhar antes da publicação.
29. Nenhuma mensagem que falhe no contrato é entregue ao RabbitMQ, inclusive quando a publicação é solicitada por qualquer um dos caminhos públicos preexistentes.
30. Uma mensagem válida continua sendo publicada com os mesmos nomes de campos, exchange e routing key usados antes do endurecimento da validação.
31. A mensagem publicada contém `metadata.service` igual a `checkout-service` e `metadata.timestamp` como data e hora ISO 8601 válida.
32. Quando o chamador fornece `Order.createdAt`, a mensagem publicada preserva esse valor em `createdAt`; quando um chamador legado omite o campo, a publicação continua preenchendo uma data válida.
33. Valores de `Order.total` e `CartItem.price` provenientes de colunas decimais são publicados como números válidos, sem alterar seus valores monetários.
34. Uma mensagem montada a partir do domínio usa `Order.id`, `Order.userId`, `Order.total`, `Order.paymentMethod`, `Order.createdAt` e os campos `productId`, `quantity` e `price` dos itens do carrinho indicado por `Order.cartId`.
35. A mensagem não inclui `cartId`, status do pedido, `productName` nem `subtotal`.
36. O fixture da rota de teste usa UUIDs e valores monetários válidos e continua respondendo pelo mesmo endpoint e com o mesmo formato de resposta.
37. O `payments-service` rejeita, antes do processamento, mensagens que violem qualquer regra do contrato, inclusive violações presentes dentro de `items`.
38. Uma mensagem rejeitada pelo consumidor não é contabilizada como sucesso e segue o tratamento de falha, retry e dead-letter já existente.
39. Testes de contrato demonstram que o publicador e o consumidor aceitam o mesmo conjunto de mensagens válidas e rejeitam as mesmas categorias de mensagens inválidas.
40. Os métodos públicos preexistentes do serviço de publicação mantêm seus nomes, parâmetros e compatibilidade para chamadores que já enviam mensagens válidas.
