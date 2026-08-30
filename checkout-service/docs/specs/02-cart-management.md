# Cart management

## Objetivo

Permitir que um usuário autenticado do `checkout-service` monte seu carrinho de compras: adicionar itens validados contra o `products-service`, consultar o carrinho ativo e remover itens, sempre com o total recalculado a partir dos subtotais. A entrega também deve introduzir a comunicação HTTP entre o `checkout-service` e o `products-service`, preparando o serviço para a finalização de compra que será definida em uma especificação futura.

## Escopo

Esta especificação cobre exclusivamente:

- o `ProductsClientService`, responsável pela comunicação HTTP com o `products-service`;
- o serviço de domínio que gerencia o carrinho ativo do usuário;
- os endpoints `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId`;
- os DTOs de entrada e o contrato de resposta do carrinho;
- as regras de cálculo de `subtotal` e `total`;
- as regras de propriedade do carrinho (cada usuário manipula somente o seu);
- a validação global de entrada e a documentação Swagger dessas rotas;
- o registro dos novos componentes no `CartModule` e, se necessário, no `AppModule`.

Não fazem parte deste escopo o checkout, a criação de `Order`, a publicação de mensagens de pagamento, a alteração de quantidade de um item já existente, a validação de estoque, a autorização por role, a remoção do carrinho inteiro, o histórico de carrinhos `completed`/`abandoned` e qualquer alteração no `products-service`, no `payments-service` ou no `api-gateway`.

As entidades `Cart`, `CartItem` e `Order`, o `AuthModule`, o `JwtAuthGuard` global, o `EventsModule` e a topologia RabbitMQ definidos na especificação `01` devem permanecer inalterados. É permitido apenas registrar novos providers e controllers nos módulos existentes.

## Contrato do produto consumido

O `checkout-service` consome o endpoint público `GET /products/:id` do `products-service`. O cliente HTTP deve reconhecer o seguinte contrato de resposta:

| Campo | Tipo | Uso no carrinho |
| --- | --- | --- |
| `id` | UUID | Persistido em `CartItem.productId` |
| `name` | string | Persistido em `CartItem.productName` |
| `price` | número monetário | Persistido em `CartItem.price` e usado no cálculo do subtotal |
| `stock` | inteiro | Lido, porém não utilizado nesta especificação |
| `isActive` | booleano | Usado para bloquear a adição de produtos inativos |
| `sellerId` | UUID | Não utilizado nesta especificação |

O `products-service` pode devolver `price` como número ou como representação textual de decimal. O cliente deve normalizar o valor para número antes de qualquer cálculo ou persistência, e deve rejeitar respostas cujo `id`, `name`, `price` ou `isActive` não atendam ao contrato acima.

Campos adicionais retornados pelo `products-service` devem ser ignorados e nunca propagados para o carrinho ou para a resposta HTTP do `checkout-service`.

## Contrato de resposta do carrinho

Todos os três endpoints devem responder com a mesma representação do carrinho:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID ou nulo | Identificador do carrinho ativo; nulo somente na representação de carrinho vazio descrita no RF-04 |
| `userId` | UUID | Sempre o identificador do usuário autenticado |
| `status` | enum | Sempre `active` nesta especificação |
| `items` | lista | Itens do carrinho; pode ser vazia |
| `items[].id` | UUID | Identificador do `CartItem`, usado como `itemId` na remoção |
| `items[].productId` | UUID | Produto de origem no `products-service` |
| `items[].productName` | string | Snapshot do nome no momento da adição |
| `items[].price` | número | Snapshot do preço no momento da adição, com duas casas decimais |
| `items[].quantity` | inteiro positivo | Quantidade acumulada do produto no carrinho |
| `items[].subtotal` | número | `price × quantity`, com duas casas decimais |
| `total` | número | Soma de todos os `subtotal`, com duas casas decimais |
| `createdAt` | data e hora | Criação do carrinho; nulo na representação de carrinho vazio |
| `updatedAt` | data e hora | Última alteração do carrinho; nulo na representação de carrinho vazio |

Valores monetários persistidos em colunas decimais são devolvidos pelo driver do banco como texto. A resposta HTTP não deve expor essa representação textual: `price`, `subtotal` e `total` devem ser números.

A resposta não deve conter `cartId` dentro dos itens, a relação `cart` carregada, dados de outros usuários nem qualquer campo do produto além dos definidos acima.

## Requisitos funcionais

### RF-01 — ProductsClientService

- Deve existir um `ProductsClientService` dedicado à comunicação HTTP com o `products-service`, isolado das regras de negócio do carrinho.
- O serviço deve expor um método `getProduct(productId)` que consulta `GET /products/:id` no `products-service`.
- A comunicação deve usar o `HttpModule` do `@nestjs/axios`, já presente nas dependências do serviço.
- A URL base deve vir de `PRODUCTS_SERVICE_URL`, lida por meio do `EnvService` já existente, sem URL fixa no código e sem leitura direta de `process.env` fora do módulo de ambiente.
- A requisição deve possuir timeout explícito, para que uma indisponibilidade do `products-service` não deixe a requisição do carrinho pendente indefinidamente.
- A chamada não deve encaminhar o token JWT do usuário nem qualquer credencial, pois o endpoint consumido é público.
- O retorno deve ser um objeto normalizado conforme a seção "Contrato do produto consumido", com `price` numérico.
- Quando o `products-service` responder `404`, o método deve sinalizar produto inexistente de forma que o chamador possa traduzir isso em erro de negócio.
- Quando o `products-service` estiver indisponível, responder com erro de servidor, exceder o timeout ou devolver um corpo fora do contrato, o método deve falhar de forma controlada e distinguível do caso de produto inexistente.
- Falhas não devem expor URL interna, stack trace, corpo bruto da resposta do `products-service` ou detalhes de infraestrutura na resposta HTTP ao cliente.
- O `ProductsClientService` não deve acessar o banco de dados do `checkout-service` nem conhecer as entidades `Cart` e `CartItem`.

### RF-02 — Serviço de carrinho

- Deve existir um serviço de domínio responsável por localizar, criar e alterar o carrinho ativo de um usuário.
- O serviço deve obter o carrinho pelo `userId` do usuário autenticado combinado com `status` igual a `active`, nunca por identificador informado pelo cliente.
- O serviço deve criar um carrinho `active` sob demanda, apenas quando o usuário adiciona seu primeiro item.
- O serviço deve concentrar o cálculo de `subtotal` e `total`, de modo que nenhum controller execute cálculo monetário.
- O serviço deve normalizar os valores decimais lidos do banco antes de calcular e antes de responder.
- O serviço deve funcionar de forma idêntica para usuários com role `seller` e `buyer`.

### RF-03 — POST /cart/items

- Deve existir o endpoint `POST /cart/items`, protegido pelo guard global, sem `@Public()`.
- O corpo da requisição deve conter exatamente `productId` e `quantity`.
- `productId` deve ser um UUID válido e obrigatório.
- `quantity` deve ser um inteiro obrigatório maior ou igual a `1`.
- Campos desconhecidos no corpo devem ser rejeitados, e a validação deve ocorrer antes de qualquer chamada HTTP ou acesso ao banco.
- O endpoint deve consultar o produto no `products-service` por meio do `ProductsClientService` antes de qualquer escrita.
- Um produto inexistente deve impedir a adição.
- Um produto com `isActive` igual a `false` deve impedir a adição.
- Quando o usuário ainda não possuir carrinho `active`, um carrinho deve ser criado para ele.
- Quando o mesmo `productId` já existir no carrinho ativo, a quantidade recebida deve ser somada à quantidade existente e o `subtotal` do item deve ser recalculado, sem criar um segundo item para o mesmo produto.
- Quando o `productId` ainda não existir no carrinho, um novo `CartItem` deve ser criado com `productName` e `price` obtidos do `products-service` no momento da adição.
- O `subtotal` do item deve ser `price × quantity`, com duas casas decimais.
- O `total` do carrinho deve ser recalculado como a soma dos `subtotal` de todos os itens e persistido no carrinho.
- A resposta de sucesso deve devolver o carrinho completo, com itens e total, no contrato definido nesta especificação.
- Nenhuma escrita deve ocorrer quando a validação de entrada, a busca do produto ou a regra de produto ativo falhar.

### RF-04 — GET /cart

- Deve existir o endpoint `GET /cart`, protegido pelo guard global, sem `@Public()`.
- O endpoint deve devolver o carrinho `active` do usuário autenticado, com seus itens e o total.
- Quando o usuário não possuir carrinho `active`, o endpoint deve responder com sucesso e uma representação de carrinho vazio, com `id` nulo, `userId` do usuário autenticado, `status` igual a `active`, `items` vazio e `total` igual a `0`.
- A consulta de um carrinho inexistente não deve criar carrinho nem qualquer outro registro no banco.
- O endpoint não deve aceitar identificador de carrinho ou de usuário por parâmetro, query string ou corpo.
- O endpoint não deve chamar o `products-service`; os dados exibidos são o snapshot armazenado nos itens.

### RF-05 — DELETE /cart/items/:itemId

- Deve existir o endpoint `DELETE /cart/items/:itemId`, protegido pelo guard global, sem `@Public()`.
- `itemId` deve ser validado como UUID antes de qualquer acesso ao banco.
- O item deve ser localizado exclusivamente dentro do carrinho `active` do usuário autenticado.
- Um `itemId` inexistente, pertencente a outro usuário ou pertencente a um carrinho não ativo deve resultar na mesma resposta de item não encontrado, sem revelar a existência do recurso.
- A remoção deve excluir apenas o item indicado, preservando os demais itens do carrinho.
- O `total` do carrinho deve ser recalculado e persistido após a remoção.
- Ao remover o último item, o carrinho deve permanecer `active` com `items` vazio e `total` igual a `0`.
- A resposta de sucesso deve devolver o carrinho atualizado no mesmo contrato dos demais endpoints.

### RF-06 — Validação de entrada e tratamento de erros

- O serviço deve possuir validação global de entrada registrada no bootstrap da aplicação, seguindo o mesmo padrão de DTOs baseados em schema já adotado no `products-service`.
- As dependências necessárias para essa validação devem constar de forma consistente no manifesto e no lockfile do `checkout-service`.
- Os erros devem ser mapeados para os seguintes status HTTP:

| Situação | Status |
| --- | --- |
| Corpo ou parâmetro fora do contrato de entrada | `400` |
| Token ausente, inválido ou expirado | `401` |
| Produto inexistente no `products-service` | `404` |
| Item inexistente no carrinho ativo do usuário | `404` |
| Produto existente porém inativo | `422` |
| `products-service` indisponível, com erro de servidor, em timeout ou fora do contrato | `503` |

- As mensagens de erro devem ser de domínio, em português, coerentes com o estilo já usado nos demais serviços, e não devem expor detalhes de infraestrutura.

### RF-07 — Registro e documentação

- Os novos providers e o controller do carrinho devem ser registrados no `CartModule` já existente, que deve importar o `HttpModule` e o módulo de ambiente necessários.
- O `AppModule` deve continuar registrando exatamente um `JwtAuthGuard` como `APP_GUARD`, sem duplicação e sem alteração dos módulos preexistentes.
- Os três endpoints devem aparecer na documentação Swagger em `/api`, agrupados sob a tag de carrinho e declarados como rotas autenticadas por Bearer JWT.
- A documentação deve descrever o contrato de entrada e o contrato de resposta do carrinho.
- Nenhum endpoint novo além dos três definidos nesta especificação deve ser criado.

## Regras de negócio

- Cada usuário possui no máximo um carrinho com status `active`.
- Um carrinho é criado apenas na primeira adição de item; consultar ou remover nunca cria carrinho.
- O nome e o preço do produto são gravados no `CartItem` no momento da adição, como snapshot. Alterações posteriores no `products-service` não devem alterar itens já presentes no carrinho.
- Um produto aparece no máximo uma vez em um carrinho; adições repetidas do mesmo produto somam quantidades no item existente.
- `subtotal` de um item é sempre `price × quantity`.
- `total` do carrinho é sempre a soma dos `subtotal` de todos os seus itens, nunca um valor informado pelo cliente.
- Todos os valores monetários são tratados com duas casas decimais, compatíveis com a precisão 10 e escala 2 das entidades.
- Um usuário só pode ler e alterar o próprio carrinho; a identidade vem exclusivamente de `req.user.id`, jamais de dados enviados na requisição.
- Sellers e buyers possuem exatamente as mesmas permissões sobre o próprio carrinho.
- Somente produtos ativos podem ser adicionados; a disponibilidade de estoque não é avaliada nesta etapa.

## Fluxo esperado de adição de item

1. Uma requisição autenticada chega em `POST /cart/items`.
2. O guard global valida o token e disponibiliza a identidade em `req.user`.
3. A validação de entrada rejeita corpos fora do contrato antes de qualquer efeito colateral.
4. O `ProductsClientService` consulta o produto no `products-service`.
5. Produto inexistente ou inativo interrompe o fluxo sem escrita no banco.
6. O carrinho `active` do usuário é localizado ou criado.
7. O item é criado ou tem sua quantidade somada, e seu subtotal é recalculado.
8. O total do carrinho é recalculado e persistido.
9. O carrinho completo, com itens e total normalizados, é devolvido na resposta.

## Restrições e fora de escopo

- Não criar endpoint de checkout, finalização de compra ou geração de `Order`.
- Não publicar mensagens no RabbitMQ nem alterar o `EventsModule`.
- Não criar endpoint ou operação de alteração de quantidade de um item existente; a alteração é feita removendo e adicionando novamente.
- Não criar endpoint de remoção ou limpeza do carrinho inteiro.
- Não validar estoque, reservar estoque nem alterar produtos no `products-service`.
- Não transicionar o carrinho para `completed` ou `abandoned`.
- Não alterar as entidades `Cart`, `CartItem` e `Order` definidas na especificação `01`.
- Não introduzir `RoleGuard`, decorator de roles ou qualquer diferenciação de permissão entre sellers e buyers.
- Não consultar o `users-service` para validar o usuário autenticado.
- Não expor rotas de carrinho como públicas.
- Não adicionar cache, circuit breaker ou retry na comunicação com o `products-service` nesta etapa.
- Não modificar o `api-gateway`, o `products-service` ou o `payments-service`.

## Critérios de aceite

1. O projeto compila sem erros após a inclusão do cliente HTTP, do serviço de carrinho, do controller e dos DTOs.
2. O manifesto e o lockfile contêm de forma consistente as dependências necessárias para a validação global de entrada.
3. O `ProductsClientService` monta a URL da requisição a partir de `PRODUCTS_SERVICE_URL` obtido pelo `EnvService`, sem valor fixo no código.
4. `getProduct` executa uma requisição `GET` para `/products/:id` no `products-service` e devolve `id`, `name`, `price`, `stock`, `isActive` e `sellerId` normalizados, com `price` numérico.
5. `getProduct` não envia header de autorização nem credenciais na requisição.
6. `getProduct` aplica timeout e falha de forma controlada quando o `products-service` não responde.
7. `getProduct` distingue produto inexistente de falha de comunicação, e nenhuma das falhas expõe URL interna, stack trace ou corpo bruto da resposta.
8. `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId` respondem `401` sem token, com token malformado, expirado ou assinado com outro secret.
9. `POST /cart/items` responde `400` quando `productId` não é UUID, quando `quantity` é ausente, zero, negativa, fracionária ou não numérica, e quando o corpo contém campos desconhecidos.
10. Uma requisição inválida em `POST /cart/items` não chega a consultar o `products-service` e não escreve nada no banco.
11. `POST /cart/items` responde `404` quando o `products-service` informa que o produto não existe.
12. `POST /cart/items` responde `422` quando o produto existe com `isActive` igual a `false`, sem criar carrinho nem item.
13. `POST /cart/items` responde `503` quando o `products-service` está indisponível, retorna erro de servidor, excede o timeout ou devolve um corpo fora do contrato.
14. A primeira adição bem-sucedida de um usuário sem carrinho cria exatamente um carrinho com `status` igual a `active` e `userId` igual ao `id` do usuário autenticado.
15. Após uma adição bem-sucedida, o `CartItem` persiste `productName` e `price` exatamente como retornados pelo `products-service` no momento da adição.
16. Uma alteração de nome ou preço no `products-service` posterior à adição não altera o `productName` nem o `price` do item já existente no carrinho.
17. `subtotal` de cada item é igual a `price × quantity` com duas casas decimais.
18. Adicionar o mesmo `productId` duas vezes resulta em um único item, com quantidade igual à soma das quantidades e `subtotal` recalculado sobre a quantidade acumulada.
19. Adicionar dois produtos distintos resulta em dois itens no mesmo carrinho ativo, sem criar um segundo carrinho.
20. Após qualquer adição, o `total` persistido no carrinho é igual à soma dos `subtotal` de todos os itens.
21. A resposta de `POST /cart/items` devolve o carrinho completo, com a lista de itens e o total atualizados.
22. `GET /cart` devolve o carrinho ativo do usuário autenticado com seus itens e o total.
23. `GET /cart` de um usuário sem carrinho ativo responde `200` com `id` nulo, `items` vazio e `total` igual a `0`, sem criar nenhum registro no banco.
24. `GET /cart` não realiza chamada HTTP ao `products-service`.
25. `DELETE /cart/items/:itemId` responde `400` quando `itemId` não é um UUID válido.
26. `DELETE /cart/items/:itemId` remove somente o item indicado, mantendo os demais itens do carrinho intactos.
27. Após a remoção, o `total` persistido do carrinho é igual à soma dos `subtotal` dos itens restantes.
28. A remoção do último item mantém o carrinho `active`, com `items` vazio e `total` igual a `0`.
29. `DELETE /cart/items/:itemId` responde `404` para um `itemId` inexistente e responde igualmente `404`, sem remover nada, para um item pertencente ao carrinho de outro usuário.
30. Dois usuários distintos que adicionam produtos possuem carrinhos independentes, e nenhuma resposta expõe itens ou identificadores do carrinho do outro usuário.
31. Nenhum endpoint aceita `userId` ou `cartId` vindos do corpo, da query string ou da rota para determinar o carrinho manipulado.
32. Usuários com role `seller` e com role `buyer` obtêm o mesmo comportamento nos três endpoints.
33. Em todas as respostas, `price`, `subtotal` e `total` são números, e não representações textuais de decimal.
34. Nenhuma resposta inclui `cartId` dentro dos itens, a relação `cart` carregada ou campos do produto além de `productId`, `productName` e `price`.
35. `CartModule` registra o controller, o serviço de carrinho e o `ProductsClientService`, importa o `HttpModule` e mantém o registro de `Cart` e `CartItem` no TypeORM.
36. O `AppModule` continua registrando exatamente um `JwtAuthGuard` como `APP_GUARD` e mantém os módulos preexistentes inalterados.
37. Os três endpoints aparecem no Swagger em `/api` sob a tag de carrinho, declarados como autenticados por Bearer JWT.
38. Não existem endpoints de checkout, criação de `Order`, alteração de quantidade ou remoção do carrinho inteiro decorrentes desta entrega.
39. As entidades `Cart`, `CartItem` e `Order` permanecem com os mesmos campos, tipos e metadados definidos na especificação `01`.
40. O `EventsModule`, seus providers, exports e a topologia RabbitMQ permanecem inalterados, e nenhuma mensagem é publicada pelos fluxos de carrinho.
