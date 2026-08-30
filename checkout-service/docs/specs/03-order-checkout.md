# Order checkout

## Objetivo

Permitir que um usuário autenticado finalize seu carrinho ativo no `checkout-service`: gerar um pedido com o total e o meio de pagamento escolhidos, encerrar o carrinho e publicar a ordem de pagamento no RabbitMQ para processamento assíncrono pelo `payments-service`. A entrega também deve permitir que o usuário liste seus pedidos e consulte um pedido específico, fechando o fluxo de compra do lado do checkout.

## Escopo

Esta especificação cobre exclusivamente:

- o endpoint `POST /cart/checkout`;
- os endpoints `GET /orders` e `GET /orders/:id`;
- o serviço de domínio responsável por criar pedidos a partir do carrinho ativo;
- o DTO de entrada do checkout e o contrato de resposta do pedido;
- a transição do carrinho de `active` para `completed`;
- a publicação da `PaymentOrderMessage` a partir do pedido criado;
- o `OrdersModule` importando `CartModule` e `EventsModule`;
- a documentação Swagger dessas rotas.

Não fazem parte deste escopo o processamento financeiro, a atualização do status do pedido a partir do resultado do pagamento, o consumo de mensagens vindas do `payments-service`, o cancelamento de pedidos, a reserva ou baixa de estoque, o reembolso, a reemissão de pagamentos e qualquer alteração no `payments-service` ou no `api-gateway`.

As entidades `Cart`, `CartItem` e `Order`, o `AuthModule`, o `JwtAuthGuard` global, os endpoints de carrinho da especificação `02` e a topologia RabbitMQ devem permanecer inalterados. O `EventsModule` deve ser consumido como já existe, sem alteração de seus providers, exports, exchange, routing key ou formato de serialização.

## Reúso obrigatório

Esta especificação não deve reimplementar o que já existe no serviço:

| Componente existente | Uso nesta especificação |
| --- | --- |
| `PaymentsQueueService.publishPaymentOrder` | Único caminho de publicação da ordem de pagamento |
| `toPaymentOrderMessage(order, cart)` | Única forma de montar a mensagem a partir do pedido e do carrinho |
| `paymentOrderMessageSchema` e a validação já existente | Validação do contrato antes da publicação |
| Entidade `Order` e seu enum `OrderStatus` | Persistência do pedido, sem novos campos |
| Entidades `Cart` e `CartItem` expostas pelo `CartModule` | Leitura do carrinho ativo e transição de status |

Nenhum contrato de mensagem novo, mapper duplicado ou caminho alternativo de publicação deve ser criado.

## Contrato de entrada do checkout

O corpo de `POST /cart/checkout` deve conter exatamente um campo:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `paymentMethod` | enum | Obrigatório; aceita somente `credit_card`, `debit_card`, `pix` ou `boleto` |

Campos desconhecidos devem ser rejeitados. O corpo não deve aceitar `userId`, `cartId`, `total`, `amount`, `status` nem qualquer valor monetário vindo do cliente.

## Contrato de resposta do pedido

`POST /cart/checkout`, `GET /orders/:id` e cada elemento de `GET /orders` devem usar a mesma representação:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Identificador do pedido |
| `userId` | UUID | Sempre o identificador do usuário autenticado |
| `cartId` | UUID | Carrinho de origem do pedido |
| `total` | número | Total do pedido, com duas casas decimais |
| `status` | enum | `pending`, `paid`, `failed` ou `cancelled`; sempre `pending` no momento da criação |
| `paymentMethod` | string | Meio de pagamento escolhido |
| `createdAt` | data e hora | Criação do pedido |
| `updatedAt` | data e hora | Última alteração do pedido |

`total` é persistido em coluna decimal e devolvido pelo driver do banco como texto; a resposta HTTP deve expor um número, não sua representação textual.

A resposta não deve conter os itens do pedido: a entidade `Order` não possui relação com `CartItem` e as entidades não podem ser alteradas nesta especificação. O vínculo com os itens permanece disponível através de `cartId`.

## Requisitos funcionais

### RF-01 — Serviço de pedidos

- Deve existir um serviço de domínio responsável por criar pedidos a partir do carrinho ativo e por consultar os pedidos de um usuário.
- O serviço deve localizar o carrinho pelo `userId` do usuário autenticado combinado com `status` igual a `active`, nunca por identificador informado pelo cliente.
- O serviço deve acessar as entidades de carrinho por meio do que o `CartModule` já expõe, sem redeclarar as entidades e sem criar uma segunda fonte de verdade para o carrinho.
- O serviço deve concentrar a criação do pedido, a transição do carrinho e o acionamento da publicação, de modo que nenhum controller execute essas regras.
- O serviço deve normalizar os valores decimais lidos do banco antes de responder.
- O serviço deve funcionar de forma idêntica para usuários com role `seller` e `buyer`.

### RF-02 — POST /cart/checkout

- Deve existir o endpoint `POST /cart/checkout`, protegido pelo guard global, sem `@Public()`.
- O componente que expõe o endpoint deve pertencer ao `OrdersModule`, sem alterar o controller de carrinho da especificação `02` e sem conflitar com as rotas `GET /cart`, `POST /cart/items` e `DELETE /cart/items/:itemId`.
- A entrada deve ser validada conforme a seção "Contrato de entrada do checkout", antes de qualquer acesso ao banco ou publicação.
- A finalização deve exigir um carrinho `active` com pelo menos um item. Um usuário sem carrinho ativo e um carrinho ativo sem itens devem produzir a mesma recusa de regra de negócio, sem criar pedido e sem alterar o carrinho.
- O pedido criado deve receber `userId` do usuário autenticado, `cartId` do carrinho finalizado, `total` igual ao total do carrinho no momento da finalização, `paymentMethod` informado na requisição e `status` igual a `pending`.
- O `total` do pedido deve ser copiado do carrinho, jamais recebido do cliente nem recalculado a partir de preços externos.
- O carrinho finalizado deve ter seu status alterado de `active` para `completed`.
- A criação do pedido e a transição do carrinho devem ocorrer de forma atômica: nenhuma das duas escritas pode persistir sem a outra.
- A transição deve ser condicional ao carrinho ainda estar `active`, de modo que duas finalizações concorrentes do mesmo carrinho não gerem dois pedidos.
- Os itens do carrinho devem ser preservados, pois são a origem dos itens da mensagem de pagamento e do histórico do pedido.
- Após a persistência bem-sucedida, a ordem de pagamento deve ser publicada no RabbitMQ conforme o RF-03.
- A resposta de sucesso deve ser HTTP `201` com o pedido criado, no contrato definido nesta especificação.

### RF-03 — Publicação da ordem de pagamento

- A mensagem deve ser montada a partir do pedido criado e do carrinho finalizado, usando o mapper já existente.
- A publicação deve usar exclusivamente o `PaymentsQueueService` já existente, mantendo o exchange `payments`, a routing key `payment.order` e a validação de contrato já aplicada antes do envio.
- A mensagem publicada deve conter `orderId` do pedido, `userId` do usuário, `amount` igual ao total do pedido, `paymentMethod` escolhido, `createdAt` do pedido e um item para cada `CartItem` do carrinho finalizado, com `productId`, `quantity` e `price` do snapshot.
- A publicação deve ocorrer **depois** da confirmação das escritas no banco. Uma mensagem nunca deve ser publicada para um pedido que não foi efetivamente persistido, pois isso levaria o `payments-service` a processar um pagamento inexistente.
- Uma falha na publicação, ocorrida após a persistência, não deve invalidar o pedido já criado: a requisição deve continuar respondendo `201` com o pedido, que permanece com status `pending`, e a falha deve ser registrada em log com o identificador do pedido.
- A falha de publicação não deve reverter o status do carrinho nem expor detalhes de infraestrutura na resposta HTTP.
- Nenhum outro evento, exchange, fila ou routing key deve ser introduzido.

### RF-04 — GET /orders

- Deve existir o endpoint `GET /orders`, protegido pelo guard global, sem `@Public()`.
- O endpoint deve retornar todos os pedidos do usuário autenticado, no contrato de resposta definido nesta especificação.
- Os pedidos devem ser ordenados por data de criação, do mais recente para o mais antigo.
- Um usuário sem pedidos deve receber uma lista vazia, e não um erro.
- O endpoint não deve aceitar identificador de usuário por parâmetro, query string ou corpo, nem retornar pedidos de outros usuários.

### RF-05 — GET /orders/:id

- Deve existir o endpoint `GET /orders/:id`, protegido pelo guard global, sem `@Public()`.
- `id` deve ser validado como UUID antes de qualquer acesso ao banco.
- O pedido deve ser localizado combinando o `id` da rota com o `userId` do usuário autenticado.
- Um pedido inexistente e um pedido pertencente a outro usuário devem resultar na mesma resposta de pedido não encontrado, sem revelar a existência do recurso.
- A resposta de sucesso deve devolver o pedido no mesmo contrato dos demais endpoints.

### RF-06 — OrdersModule

- O `OrdersModule` deve importar o `CartModule` e o `EventsModule`.
- O `OrdersModule` deve manter o registro da entidade `Order` no TypeORM e passar a declarar o controller e o serviço de pedidos desta especificação.
- O `CartModule` deve continuar expondo o que o `OrdersModule` precisa para ler e atualizar o carrinho ativo, sem que o `OrdersModule` redeclare as entidades de carrinho.
- Não deve haver dependência circular entre `CartModule`, `OrdersModule` e `EventsModule`.
- O `AppModule` deve continuar registrando os módulos preexistentes e exatamente um `JwtAuthGuard` como `APP_GUARD`.

### RF-07 — Tratamento de erros e documentação

- Os erros devem ser mapeados para os seguintes status HTTP:

| Situação | Status |
| --- | --- |
| Corpo ou parâmetro fora do contrato de entrada | `400` |
| Token ausente, inválido ou expirado | `401` |
| Pedido inexistente ou pertencente a outro usuário | `404` |
| Sem carrinho ativo, ou carrinho ativo sem itens | `422` |

- As mensagens de erro devem ser de domínio, em português, coerentes com o estilo já usado nos demais serviços, e não devem expor detalhes de infraestrutura, credenciais do RabbitMQ ou dados de outros usuários.
- Os três endpoints devem aparecer na documentação Swagger em `/api`, declarados como rotas autenticadas por Bearer JWT, descrevendo o contrato de entrada do checkout e o contrato de resposta do pedido.
- Nenhum endpoint além dos três definidos nesta especificação deve ser criado.

## Regras de negócio

- Só é possível finalizar um carrinho `active` que possua ao menos um item.
- Um carrinho gera no máximo um pedido: depois de finalizado ele fica `completed` e não pode ser finalizado novamente.
- Um usuário pode ter vários pedidos ao longo do tempo, mas continua limitado a um único carrinho `active`.
- Após a finalização, o usuário fica sem carrinho ativo; a próxima adição de item cria um carrinho novo, sem os itens do pedido anterior.
- O `total` do pedido é um snapshot do total do carrinho no instante da finalização e não muda depois, mesmo que preços mudem no `products-service`.
- Todo pedido nasce com status `pending`; a evolução do status é responsabilidade do fluxo de pagamento e não faz parte desta especificação.
- Um usuário só pode finalizar o próprio carrinho e consultar os próprios pedidos; a identidade vem exclusivamente de `req.user.id`.
- Sellers e buyers possuem exatamente as mesmas permissões nos três endpoints.
- O pagamento é assíncrono: a resposta do checkout confirma o registro do pedido e o envio para processamento, nunca a aprovação do pagamento.

## Fluxo esperado de finalização

1. Uma requisição autenticada chega em `POST /cart/checkout`.
2. O guard global valida o token e disponibiliza a identidade em `req.user`.
3. A validação de entrada rejeita meios de pagamento fora do enum e corpos com campos desconhecidos.
4. O carrinho `active` do usuário é localizado e verificado quanto à existência de itens.
5. O pedido é criado com o total do carrinho, o meio de pagamento e status `pending`, e o carrinho passa a `completed`, de forma atômica.
6. Confirmadas as escritas, a mensagem de pagamento é montada a partir do pedido e do carrinho e publicada no exchange `payments` com a routing key `payment.order`.
7. O pedido criado é devolvido com HTTP `201`.
8. O `payments-service` consome a mensagem e processa o pagamento de forma assíncrona, fora do escopo desta especificação.

## Restrições e fora de escopo

- Não processar pagamento, autorizar cobrança, integrar gateway financeiro ou consultar o `payments-service` de forma síncrona.
- Não consumir mensagens de resultado de pagamento nem atualizar `Order.status` a partir delas.
- Não criar endpoints de cancelamento, reembolso, reprocessamento ou alteração de pedido.
- Não validar, reservar ou dar baixa em estoque.
- Não chamar o `products-service` durante a finalização; os itens já são snapshots no carrinho.
- Não alterar as entidades `Cart`, `CartItem` e `Order`, nem adicionar relação entre `Order` e `CartItem`.
- Não alterar os endpoints de carrinho da especificação `02`.
- Não modificar o `EventsModule`, o `PaymentsQueueService`, o contrato `PaymentOrderMessage`, o exchange, a routing key ou a fila.
- Não implementar retry, dead-letter próprio, outbox ou reconciliação de pedidos cuja publicação falhou; a limitação deve ficar registrada, não resolvida.
- Não introduzir `RoleGuard`, decorator de roles ou diferenciação de permissão entre sellers e buyers.
- Não modificar o `api-gateway`, o `products-service` ou o `payments-service`.

## Critérios de aceite

1. O projeto compila sem erros após a inclusão do serviço, do controller, do DTO e do wiring do `OrdersModule`.
2. `POST /cart/checkout`, `GET /orders` e `GET /orders/:id` respondem `401` sem token, com token malformado, expirado ou assinado com outro secret.
3. `POST /cart/checkout` responde `400` quando `paymentMethod` está ausente, é vazio, não é string ou não pertence a `credit_card`, `debit_card`, `pix` e `boleto`.
4. `POST /cart/checkout` responde `400` quando o corpo contém campos desconhecidos, incluindo tentativas de enviar `userId`, `cartId`, `total` ou `status`.
5. Uma requisição de checkout inválida não cria pedido, não altera o carrinho e não publica mensagem.
6. `POST /cart/checkout` responde `422` quando o usuário não possui carrinho `active`.
7. `POST /cart/checkout` responde `422` quando o carrinho ativo existe mas não possui itens, sem criar pedido, sem alterar o status do carrinho e sem publicar mensagem.
8. Um checkout bem-sucedido responde `201` com um pedido cujo `userId` é o do usuário autenticado, `cartId` é o do carrinho finalizado, `paymentMethod` é o enviado e `status` é `pending`.
9. O `total` do pedido criado é exatamente igual ao total do carrinho no momento da finalização.
10. O carrinho finalizado passa a ter status `completed` no banco.
11. Os itens do carrinho finalizado continuam existindo no banco após o checkout.
12. Após um checkout bem-sucedido, `GET /cart` responde com a representação de carrinho vazio, pois o usuário não possui mais carrinho ativo.
13. Após um checkout bem-sucedido, adicionar um item cria um carrinho novo, com identificador diferente e sem os itens do pedido anterior.
14. Um segundo `POST /cart/checkout` imediatamente após um checkout bem-sucedido responde `422` e não cria um segundo pedido.
15. Duas finalizações concorrentes do mesmo carrinho produzem no máximo um pedido e no máximo uma mensagem publicada.
16. Um checkout bem-sucedido publica exatamente uma mensagem, no exchange `payments` e com a routing key `payment.order`.
17. A mensagem publicada contém `orderId` igual ao `id` do pedido criado, `userId` do usuário, `amount` igual ao total do pedido e `paymentMethod` igual ao informado.
18. A mensagem publicada contém um item para cada `CartItem` do carrinho finalizado, com `productId`, `quantity` e `price` correspondentes ao snapshot do carrinho.
19. `amount` e cada `items[].price` da mensagem são números válidos, e não representações textuais de decimal.
20. A mensagem publicada preserva `createdAt` do pedido e recebe `metadata.service` igual a `checkout-service` e `metadata.timestamp` ISO 8601, conforme o comportamento já existente da publicação.
21. A publicação usa o `PaymentsQueueService` existente e passa pela validação de contrato já aplicada antes do envio, sem caminho alternativo de publicação.
22. Nenhuma mensagem é publicada quando a persistência do pedido falha.
23. Quando a publicação falha após a persistência, a resposta continua sendo `201` com o pedido criado, o pedido permanece `pending`, o carrinho permanece `completed` e a falha é registrada em log com o identificador do pedido.
24. Uma falha de publicação não expõe detalhes de infraestrutura, credenciais ou stack trace na resposta HTTP.
25. `GET /orders` retorna somente os pedidos do usuário autenticado, no contrato de resposta definido nesta especificação.
26. `GET /orders` retorna os pedidos ordenados da data de criação mais recente para a mais antiga.
27. `GET /orders` responde `200` com lista vazia para um usuário sem pedidos.
28. `GET /orders` não retorna pedidos de outro usuário, mesmo quando um identificador de usuário é enviado por query string ou corpo.
29. `GET /orders/:id` responde `400` quando `id` não é um UUID válido.
30. `GET /orders/:id` retorna o pedido do usuário autenticado no contrato definido nesta especificação.
31. `GET /orders/:id` responde `404` para um pedido inexistente e responde igualmente `404`, sem expor dados, para um pedido pertencente a outro usuário.
32. Em todas as respostas dos três endpoints, `total` é número, e não representação textual de decimal.
33. Nenhuma resposta de pedido inclui itens, relação com `CartItem` ou dados de outros usuários.
34. Usuários com role `seller` e com role `buyer` obtêm o mesmo comportamento nos três endpoints.
35. Dois usuários distintos que finalizam carrinhos possuem pedidos independentes, e nenhum deles enxerga os pedidos do outro.
36. O `OrdersModule` importa `CartModule` e `EventsModule`, registra a entidade `Order`, o controller e o serviço de pedidos, e a aplicação inicia sem dependência circular.
37. Os endpoints de carrinho da especificação `02` continuam funcionando com o mesmo comportamento e as mesmas respostas.
38. As entidades `Cart`, `CartItem` e `Order` permanecem com os mesmos campos, tipos e metadados definidos na especificação `01`.
39. O `EventsModule`, seus providers, exports, exchange, routing key, fila e formato de serialização permanecem inalterados, assim como o contrato `PaymentOrderMessage`.
40. Os três endpoints aparecem no Swagger em `/api`, declarados como autenticados por Bearer JWT, e não existem endpoints de cancelamento, reembolso, alteração de pedido ou processamento de pagamento decorrentes desta entrega.
