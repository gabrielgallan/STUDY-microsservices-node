# Checkout service gateway integration

## Objetivo

Expor no `api-gateway` as rotas de carrinho e de pedidos já implementadas no `checkout-service`, de modo que um cliente externo consuma todo o fluxo de compra — autenticar, montar o carrinho, finalizar e consultar pedidos — por um único ponto de entrada na porta 3005, sem falar diretamente com o `checkout-service`. As chamadas devem atravessar o mecanismo de proxy existente do gateway, herdando circuit breaker, retry, timeout e fallback já implementados, e repassando a identidade do usuário autenticado.

## Escopo

Esta especificação cobre exclusivamente:

- o `CheckoutModule` do gateway e seus dois controllers de proxy;
- o `CartProxyController`, com as três rotas de carrinho;
- o `OrdersProxyController`, com a finalização e as duas rotas de pedidos;
- o repasse do header `Authorization` e da identidade autenticada em todas essas rotas;
- a correção da URL de destino do `checkout` na configuração de serviços do gateway;
- o registro do `CheckoutModule` no `AppModule` do gateway;
- a documentação Swagger dessas rotas;
- os testes de roteamento e o teste E2E do fluxo completo através do gateway.

Não fazem parte deste escopo qualquer alteração no `checkout-service`, no `ProxyService`, no `CircuitBreakerService`, no `RetryService`, no `TimeoutService`, nos serviços de fallback, no `JwtAuthGuard`, na estratégia JWT, no throttler ou na topologia de autenticação do gateway. Também não fazem parte deste escopo rotas de pagamento, rotas administrativas, cache específico de carrinho, agregação de respostas de múltiplos serviços e regras de negócio de carrinho ou pedido — todas continuam sendo responsabilidade do `checkout-service`.

## Situação atual e ajuste necessário

O gateway já possui tudo que é preciso para proxyar o `checkout-service`:

| Componente existente | Situação |
| --- | --- |
| `ProxyService.proxyRequest` | Pronto; aceita `checkout` como `serviceName` |
| Fallback de `checkout` em `createServiceFallback` | Já implementado, com mensagem de indisponibilidade |
| `JwtAuthGuard` e decorator `@Public()` | Prontos e usados pelos controllers existentes |
| Tag `Checkout` no Swagger | Já declarada no bootstrap do gateway |
| `CHECKOUT_SERVICE_URL` no schema de ambiente | Presente, com default correto `http://localhost:3003` |

Há, porém, uma divergência que precisa ser corrigida para que o proxy alcance o serviço certo: na configuração de serviços do gateway, a entrada `checkout` lê a variável de ambiente diretamente e usa **`http://localhost:3002` como valor padrão**, que é a porta do `products-service`. Enquanto a variável estiver definida no ambiente o destino fica correto, mas em qualquer execução sem essa variável as requisições de carrinho e pedido seriam enviadas silenciosamente ao `products-service`.

- A entrada `checkout` da configuração de serviços deve ter como destino padrão a porta do `checkout-service` (`http://localhost:3003`), mantendo a precedência da variável de ambiente e o timeout atual de 10000 ms.
- O valor padrão deve ficar coerente com o default já declarado no schema de ambiente do gateway.
- Nenhuma outra entrada da configuração deve ser alterada nesta especificação. A entrada `payments` apresenta o mesmo tipo de divergência e deve ser corrigida na especificação de pagamentos, não aqui.

## Mapeamento de rotas

Todas as rotas abaixo são expostas pelo gateway e encaminhadas ao `checkout-service` com o mesmo método e o mesmo caminho, sem reescrita de path, sem renomear campos e sem alterar o corpo:

| Rota no gateway | Método | Destino no `checkout-service` | Controller |
| --- | --- | --- | --- |
| `/cart/items` | `POST` | `/cart/items` | `CartProxyController` |
| `/cart` | `GET` | `/cart` | `CartProxyController` |
| `/cart/items/:itemId` | `DELETE` | `/cart/items/:itemId` | `CartProxyController` |
| `/cart/checkout` | `POST` | `/cart/checkout` | `OrdersProxyController` |
| `/orders` | `GET` | `/orders` | `OrdersProxyController` |
| `/orders/:id` | `GET` | `/orders/:id` | `OrdersProxyController` |

Nenhuma outra rota deve ser criada. O gateway não deve expor rotas de carrinho ou pedido que não existam no `checkout-service`.

## Requisitos funcionais

### RF-01 — CheckoutModule

- Deve existir um módulo dedicado à integração com o `checkout-service` no gateway, seguindo o padrão dos módulos de proxy já existentes para `users-service` e `products-service`.
- O módulo deve importar o `ProxyModule` para obter o `ProxyService` já configurado e disponibilizar o `JwtAuthGuard` para seus controllers.
- O módulo deve declarar exatamente dois controllers: o de carrinho e o de pedidos.
- O módulo não deve declarar services próprios, clientes HTTP próprios, regras de negócio, cache adicional ou lógica de resiliência paralela à do `ProxyService`.

### RF-02 — CartProxyController

- Deve existir um controller de carrinho com prefixo `cart`, protegido por `JwtAuthGuard` aplicado no nível do controller.
- O controller deve expor `POST /cart/items`, `GET /cart` e `DELETE /cart/items/:itemId`.
- `POST /cart/items` deve encaminhar o corpo recebido, sem validar, reescrever, completar ou remover campos.
- `DELETE /cart/items/:itemId` deve encaminhar o `itemId` recebido na rota, preservando seu valor.
- Nenhuma das rotas deve ser marcada com `@Public()`.
- O controller deve delegar exclusivamente ao `ProxyService`, usando `checkout` como nome de serviço.

### RF-03 — OrdersProxyController

- Deve existir um segundo controller, protegido por `JwtAuthGuard` aplicado no nível do controller, responsável pela finalização e pela consulta de pedidos.
- O controller deve expor `POST /cart/checkout`, `GET /orders` e `GET /orders/:id`.
- A convivência de `POST /cart/checkout` neste controller com as rotas de carrinho do outro controller não deve gerar conflito nem ambiguidade de resolução de rota; em particular, `POST /cart/items` e `POST /cart/checkout` devem continuar sendo resolvidos de forma determinística e independente.
- `POST /cart/checkout` deve encaminhar o corpo recebido, sem validar o meio de pagamento — essa validação é do `checkout-service`.
- `GET /orders/:id` deve encaminhar o identificador recebido na rota, preservando seu valor, sem validá-lo previamente.
- Nenhuma das rotas deve ser marcada com `@Public()`.

### RF-04 — Repasse de identidade

- Todas as seis rotas devem repassar o header `Authorization` recebido do cliente para o `checkout-service`, no mesmo formato em que foi recebido.
- Todas as seis rotas devem repassar a identidade autenticada disponível na requisição para o mecanismo de proxy, do mesmo modo que os controllers de proxy existentes já fazem, preservando os headers de identidade que o `ProxyService` acrescenta.
- O gateway não deve emitir, reassinar, renovar, decodificar para reescrita ou substituir o token do usuário.
- O gateway não deve derivar o usuário do corpo da requisição, de query string ou de qualquer campo enviado pelo cliente.
- Nenhuma rota deve repassar credenciais próprias do gateway, secrets ou headers internos não previstos pelo mecanismo de proxy existente.

### RF-05 — Comportamento das respostas

- As respostas de sucesso do `checkout-service` devem chegar ao cliente com o mesmo corpo, sem reformatação, reordenação de campos, remoção de campos ou envelopamento adicional.
- Os erros de cliente devolvidos pelo `checkout-service` — incluindo `400`, `401`, `404` e `422` — devem chegar ao cliente preservando o status e a mensagem originais, conforme o comportamento já implementado no mecanismo de proxy.
- Uma requisição sem token, com token inválido ou expirado deve ser recusada pelo próprio gateway com `401`, sem encaminhar a chamada ao `checkout-service`.
- O status de sucesso de cada rota no gateway deve corresponder ao status equivalente no `checkout-service`: `201` nas duas rotas `POST`, `200` nas rotas `GET` e `200` na rota `DELETE`.
- A indisponibilidade do `checkout-service` deve ser tratada pelo fallback de `checkout` já existente, sem que o gateway exponha stack trace, URL interna, host, porta ou detalhes de infraestrutura.
- O gateway não deve traduzir, reclassificar ou mascarar erros de negócio do `checkout-service`.

### RF-06 — Registro e documentação

- O `CheckoutModule` deve ser registrado no `AppModule` do gateway, preservando todos os módulos, o guard global de rate limit, o middleware de log e a configuração já existentes.
- As seis rotas devem aparecer na documentação Swagger do gateway, agrupadas sob a tag de checkout já declarada no bootstrap, e declaradas como rotas autenticadas por Bearer JWT.
- Cada rota deve possuir uma descrição curta que identifique a operação, no mesmo padrão dos controllers de proxy existentes.
- A inclusão dessas rotas não deve alterar a documentação já publicada das rotas de usuários e produtos.

### RF-07 — Testes de roteamento

- Deve existir cobertura automatizada de roteamento para as seis rotas, no mesmo padrão do teste de roteamento já existente para o `products-service`, com o `ProxyService` substituído por um dublê e o guard de autenticação substituído por um fixture autenticado.
- Cada teste deve verificar que a rota do gateway aciona o proxy com o nome de serviço `checkout`, o método HTTP correto e o caminho de destino correto.
- Os testes devem verificar que o corpo recebido é repassado sem alteração nas rotas `POST` e que os parâmetros de rota chegam ao destino com o valor original.
- Os testes devem verificar que o header `Authorization` recebido é repassado ao proxy.
- Os testes devem verificar que um erro de cliente devolvido pelo proxy chega ao cliente com o status original.
- Esses testes não devem depender do `checkout-service`, de banco de dados, de RabbitMQ ou de rede.

### RF-08 — Teste E2E do fluxo completo

- Deve existir um teste E2E que exercite, exclusivamente através do gateway, o fluxo completo: autenticar, adicionar item ao carrinho, consultar o carrinho, finalizar a compra e consultar os pedidos.
- O teste deve seguir o padrão do E2E real já existente no gateway: subir os serviços realmente necessários a partir do build, aguardar a prontidão de cada um pelo respectivo health check, verificar previamente que as portas estão livres e encerrar os processos ao final.
- O fluxo deve usar `users-service`, `products-service`, `checkout-service` e o gateway, cada um com seu próprio banco, e o gateway deve ser iniciado apontando para as URLs reais desses serviços.
- O preparo do teste deve garantir que o `checkout-service` também esteja compilado antes da execução, assim como já ocorre com os demais serviços envolvidos.
- Nenhuma etapa do fluxo deve chamar diretamente um serviço de domínio: todas as requisições do fluxo devem passar pela porta do gateway.
- O teste deve verificar, ao final, que o pedido criado aparece na listagem de pedidos do usuário autenticado e que seu total corresponde ao total do carrinho finalizado.
- O teste deve tolerar a ausência de um broker RabbitMQ, já que a publicação da ordem de pagamento é best-effort no `checkout-service` e não altera o resultado HTTP da finalização.
- O teste deve limpar os dados que criar nos bancos envolvidos e não deve depender de dados preexistentes nem deixar resíduo que quebre execuções seguintes.
- O teste deve respeitar os limites de rate limit configurados no gateway, de modo que o próprio fluxo não seja recusado por excesso de requisições.
- O E2E real já existente para usuários e produtos deve continuar passando sem alteração de comportamento.

## Regras de integração

- O gateway é apenas trânsito: nenhuma regra de carrinho, cálculo de total, validação de produto, verificação de propriedade ou transição de status pode ser reimplementada nele.
- A autorização de fato permanece no `checkout-service`, que já valida o mesmo JWT; o gateway apenas garante que uma requisição sem token válido não chegue ao serviço.
- O `checkout-service` continua sendo a única fonte de verdade sobre carrinhos e pedidos.
- O gateway não deve armazenar em cache respostas de carrinho, de finalização ou de pedidos, por serem específicas de usuário e sensíveis a escrita.
- Os serviços de domínio continuam acessíveis diretamente em suas portas; esta especificação não introduz bloqueio de acesso direto nem alteração de rede.
- O contrato entre gateway e `checkout-service` é o mesmo já publicado pelo `checkout-service`: alterações de contrato pertencem às specs daquele serviço.

## Fluxo esperado ponta a ponta

1. O cliente autentica pelo gateway e recebe um token JWT emitido pelo `users-service`.
2. O cliente chama `POST /cart/items` no gateway com o token no header `Authorization`.
3. O `JwtAuthGuard` do gateway valida o token e disponibiliza a identidade na requisição.
4. O controller de carrinho aciona o `ProxyService` com o nome de serviço `checkout`, repassando corpo, header de autorização e identidade.
5. O `ProxyService` aplica circuit breaker, retry e timeout e encaminha a chamada ao `checkout-service`.
6. O `checkout-service` valida o token, aplica suas regras e responde.
7. A resposta retorna ao cliente com o corpo e o status originais.
8. O mesmo caminho se repete para consultar o carrinho, finalizar a compra e consultar os pedidos.

## Restrições e fora de escopo

- Não alterar o `checkout-service`, seus endpoints, contratos ou comportamento.
- Não alterar o `ProxyService`, o circuit breaker, o retry, o timeout ou os serviços de fallback.
- Não alterar o `JwtAuthGuard`, a estratégia JWT, o `SessionGuard`, o `RoleGuard` ou o throttler do gateway.
- Não criar rotas de pagamento nem alterar a entrada `payments` da configuração de serviços.
- Não criar rotas administrativas, de cancelamento, de reembolso ou de consulta de pedidos de terceiros.
- Não implementar autorização por role nas rotas de carrinho e pedido; sellers e buyers têm o mesmo acesso ao próprio carrinho.
- Não duplicar no gateway a validação de entrada já feita pelo `checkout-service`.
- Não agregar respostas de múltiplos serviços em uma única rota.
- Não introduzir cache de respostas de carrinho, finalização ou pedidos.
- Não alterar os módulos de usuários e produtos do gateway nem seus testes.

## Critérios de aceite

1. O gateway compila sem erros após a inclusão do módulo, dos dois controllers e do registro no `AppModule`.
2. A entrada `checkout` da configuração de serviços tem destino padrão na porta do `checkout-service`, mantém a precedência da variável de ambiente e preserva o timeout de 10000 ms.
3. O destino padrão da entrada `checkout` é coerente com o default declarado no schema de ambiente do gateway, e nenhuma outra entrada da configuração foi alterada.
4. Existe um módulo de checkout no gateway que importa o `ProxyModule`, declara exatamente dois controllers e não declara services de negócio próprios.
5. O `CheckoutModule` está registrado no `AppModule`, e os módulos, guards, middleware e configurações preexistentes permanecem registrados e inalterados.
6. `POST /cart/items` no gateway aciona o proxy com serviço `checkout`, método `post` e caminho `/cart/items`.
7. `GET /cart` no gateway aciona o proxy com serviço `checkout`, método `get` e caminho `/cart`.
8. `DELETE /cart/items/:itemId` no gateway aciona o proxy com serviço `checkout`, método `delete` e caminho `/cart/items/` seguido do `itemId` recebido, com o valor preservado.
9. `POST /cart/checkout` no gateway aciona o proxy com serviço `checkout`, método `post` e caminho `/cart/checkout`.
10. `GET /orders` no gateway aciona o proxy com serviço `checkout`, método `get` e caminho `/orders`.
11. `GET /orders/:id` no gateway aciona o proxy com serviço `checkout`, método `get` e caminho `/orders/` seguido do identificador recebido, com o valor preservado.
12. O corpo enviado a `POST /cart/items` chega ao proxy sem qualquer alteração de campos, tipos ou ordem.
13. O corpo enviado a `POST /cart/checkout` chega ao proxy sem alteração, inclusive quando contém um meio de pagamento inválido, que deve ser recusado pelo `checkout-service` e não pelo gateway.
14. Cada uma das seis rotas repassa ao proxy o header `Authorization` recebido do cliente.
15. Cada uma das seis rotas repassa ao proxy a identidade autenticada da requisição, no mesmo padrão dos controllers de proxy existentes.
16. Nenhuma das seis rotas está marcada como pública, e todas respondem `401` sem token, com token malformado, expirado ou assinado com outro secret.
17. Uma requisição recusada por falta de token válido não aciona o proxy nem alcança o `checkout-service`.
18. As rotas `POST` respondem `201` em caso de sucesso, as rotas `GET` respondem `200` e a rota `DELETE` responde `200`.
19. Um erro de cliente devolvido pelo `checkout-service` chega ao cliente do gateway com o mesmo status, incluindo `400`, `404` e `422`.
20. O corpo de uma resposta de sucesso chega ao cliente idêntico ao devolvido pelo `checkout-service`, sem envelopamento ou reformatação.
21. Com o `checkout-service` indisponível, a resposta usa o fallback de `checkout` já existente e não expõe stack trace, URL interna, host, porta ou detalhes de infraestrutura.
22. As seis rotas aparecem no Swagger do gateway sob a tag de checkout, declaradas como autenticadas por Bearer JWT e com descrição da operação.
23. A documentação das rotas de usuários e produtos permanece inalterada.
24. Existe cobertura automatizada de roteamento para as seis rotas, sem dependência de `checkout-service`, banco, RabbitMQ ou rede.
25. Os testes de roteamento verificam serviço, método, caminho, repasse de corpo, repasse de parâmetros de rota, repasse do header `Authorization` e preservação do status de erro de cliente.
26. Existe um teste E2E que executa, apenas pela porta do gateway, a sequência autenticar, adicionar item, consultar carrinho, finalizar e consultar pedidos.
27. O E2E sobe `users-service`, `products-service`, `checkout-service` e gateway a partir do build, aguarda os health checks, verifica que as portas estão livres antes de iniciar e encerra os processos ao final.
28. O preparo da suíte garante que o `checkout-service` esteja compilado antes da execução do E2E.
29. Nenhuma requisição do E2E é feita diretamente a um serviço de domínio.
30. No E2E, o carrinho consultado reflete o item adicionado, e o total do pedido criado corresponde ao total do carrinho finalizado.
31. No E2E, o pedido criado aparece na listagem de pedidos do usuário autenticado.
32. O E2E conclui com sucesso sem um broker RabbitMQ disponível.
33. O E2E limpa os dados que criou nos bancos envolvidos e pode ser executado repetidamente sem interferência entre execuções.
34. O fluxo do E2E não é recusado pelo rate limit configurado no gateway.
35. O E2E real preexistente de usuários e produtos continua passando sem alteração.
36. Os testes de roteamento preexistentes de usuários e produtos continuam passando sem alteração.
37. Nenhum arquivo do `checkout-service` é alterado por esta entrega.
38. O `ProxyService`, o circuit breaker, o retry, o timeout, os fallbacks, o `JwtAuthGuard` e o throttler permanecem inalterados.
39. Não existem rotas de pagamento, de cancelamento, de reembolso, administrativas ou de agregação decorrentes desta entrega.
40. Nenhuma regra de negócio de carrinho ou pedido — cálculo de total, validação de produto, verificação de propriedade ou transição de status — é implementada no gateway.
