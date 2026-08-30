# Payments gateway integration and full flow E2E

## Objetivo

Fechar a última ponta da malha de serviços: expor a consulta de pagamento do `payments-service` através do `api-gateway` e provar, com um teste automatizado ponta a ponta, que a jornada completa de compra funciona exclusivamente pela porta do gateway — registrar usuários, publicar produto, montar carrinho, finalizar pedido e acompanhar o desfecho do pagamento processado de forma assíncrona. A entrega também remove do `checkout-service` o endpoint de teste que existia apenas para exercitar a publicação no RabbitMQ.

## Escopo

Esta especificação cobre exclusivamente:

- o `PaymentsModule` do gateway e seu `PaymentsProxyController`;
- a rota `GET /payments/:orderId` no gateway, protegida por JWT;
- a correção da URL de destino do `payments` na configuração de serviços do gateway;
- o registro do `PaymentsModule` no `AppModule`;
- a remoção do endpoint de teste do `checkout-service` e o ajuste da cobertura que o exercitava;
- o teste de roteamento da nova rota;
- o teste E2E da jornada completa de compra através do gateway.

Não fazem parte deste escopo qualquer alteração no `payments-service`, no `ProxyService`, no mecanismo de resiliência do gateway, no `JwtAuthGuard`, no throttler, nos módulos de usuários, produtos e checkout do gateway, e nos endpoints de carrinho, pedido, DLQ ou métricas. Também não fazem parte deste escopo webhook ou qualquer mecanismo de atualização do status do pedido a partir do resultado do pagamento, autorização por dono do pagamento dentro do `payments-service`, estorno, cancelamento e reprocessamento de cobrança.

## Situação atual

| Componente | Situação |
| --- | --- |
| `ProxyService.proxyRequest` | Pronto; já aceita `payments` como nome de serviço |
| Fallback de `payments` em `createServiceFallback` | Já implementado, com mensagem de indisponibilidade |
| Tag `Payments` no Swagger do gateway | Já declarada no bootstrap |
| `PAYMENTS_SERVICE_URL` no schema de ambiente do gateway | Presente, com default correto `http://localhost:3004` |
| Módulos de proxy de users, products e checkout | Implementados e cobertos por testes |
| `GET /payments/:orderId` no `payments-service` | Implementado, sem autenticação própria |
| Endpoint de teste do `checkout-service` | `POST /test/send-payment`, existente apenas para exercitar a publicação |

Assim como já ocorreu com o `checkout`, a entrada `payments` da configuração de serviços do gateway lê a variável de ambiente mas usa **`http://localhost:3003` como valor padrão**, que é a porta do `checkout-service`. Enquanto a variável estiver definida o destino fica correto, mas em qualquer execução sem ela as consultas de pagamento seriam enviadas silenciosamente ao `checkout-service`. Essa correção foi explicitamente adiada na especificação anterior e faz parte desta.

## Mapeamento de rota

| Rota no gateway | Método | Destino no `payments-service` | Proteção |
| --- | --- | --- | --- |
| `/payments/:orderId` | `GET` | `/payments/:orderId` | JWT obrigatório |

Nenhuma outra rota de pagamento deve ser criada. Em particular, não devem ser expostas as rotas de DLQ nem as de métricas do `payments-service`, que são operacionais e permanecem acessíveis apenas na porta do serviço.

## Requisitos funcionais

### RF-01 — PaymentsModule e PaymentsProxyController

- Deve existir um módulo dedicado à integração com o `payments-service` no gateway, seguindo o padrão dos módulos de proxy já existentes.
- O módulo deve importar o `ProxyModule` para obter o `ProxyService` já configurado e disponibilizar o `JwtAuthGuard` para seu controller.
- Deve existir um `PaymentsProxyController` com prefixo `payments`, protegido por `JwtAuthGuard` aplicado no nível do controller.
- O controller deve expor `GET /payments/:orderId`, encaminhando ao `payments-service` o mesmo método e o mesmo caminho, com o identificador recebido preservado.
- O identificador não deve ser validado no gateway: o formato é decidido pelo `payments-service`.
- A rota não deve ser marcada com `@Public()`.
- O controller deve delegar exclusivamente ao `ProxyService`, usando `payments` como nome de serviço, e não deve conter regra de negócio, cache próprio ou lógica de resiliência paralela.

### RF-02 — Destino do payments

- A entrada `payments` da configuração de serviços deve ter como destino padrão a porta do `payments-service` (`http://localhost:3004`), mantendo a precedência da variável de ambiente e o timeout atual de 10000 ms.
- O valor padrão deve ficar coerente com o default já declarado no schema de ambiente do gateway.
- Nenhuma outra entrada da configuração deve ser alterada.

### RF-03 — Repasse de identidade e respostas

- A rota deve repassar o header `Authorization` recebido do cliente e a identidade autenticada da requisição, do mesmo modo que os controllers de proxy existentes já fazem.
- Uma requisição sem token, com token inválido ou expirado deve ser recusada pelo próprio gateway com `401`, sem encaminhar a chamada ao `payments-service`.
- O corpo de uma resposta de sucesso deve chegar ao cliente idêntico ao devolvido pelo `payments-service`, sem reformatação ou envelopamento.
- Os erros de cliente devolvidos pelo `payments-service`, incluindo `400` para identificador inválido e `404` para pedido sem pagamento, devem chegar preservando status e mensagem.
- A indisponibilidade do `payments-service` deve ser tratada pelo fallback de `payments` já existente, sem expor stack trace, URL interna, host, porta ou detalhes de infraestrutura.

### RF-04 — Registro e documentação

- O `PaymentsModule` deve ser registrado no `AppModule` do gateway, preservando os módulos, o guard global de rate limit, o middleware de log e a configuração já existentes.
- A rota deve aparecer na documentação Swagger do gateway, agrupada sob a tag de pagamentos já declarada no bootstrap, declarada como autenticada por Bearer JWT e com descrição da operação.
- A documentação das rotas de usuários, produtos, carrinho e pedidos deve permanecer inalterada.

### RF-05 — Limpeza do checkout-service

- O endpoint de teste `POST /test/send-payment` e o controller que o expõe devem ser removidos do `checkout-service`, assim como seu registro no módulo raiz.
- A cobertura automatizada que exercitava esse endpoint deve ser removida junto, sem enfraquecer as demais verificações do mesmo arquivo de teste.
- O endpoint `GET /health` deve continuar existindo, público e com o mesmo contrato de resposta.
- Os endpoints de domínio do `checkout-service` — carrinho e pedidos — devem permanecer inalterados, pois são a razão de existir do serviço.
- O serviço de publicação de pagamento e seus métodos públicos não devem ser alterados nem removidos, mesmo que algum deixe de ser chamado pela aplicação, para preservar o contrato firmado em especificação anterior.
- Nenhuma outra alteração deve ser feita no `checkout-service`.

> Observação sobre a instrução original desta limpeza: o `checkout-service` **não possui hoje uma rota `GET /`**. A limpeza aqui especificada é a remoção do endpoint de teste, mantendo o health check como única rota não pertencente ao domínio. Criar uma rota raiz informativa não faz parte desta entrega; se for desejada, deve ser especificada separadamente.

### RF-06 — Teste de roteamento

- Deve existir cobertura automatizada de roteamento para a nova rota, no mesmo padrão dos testes de roteamento já existentes, com o `ProxyService` substituído por um dublê e o guard de autenticação substituído por um fixture autenticado.
- O teste deve verificar que a rota aciona o proxy com o nome de serviço `payments`, o método `get` e o caminho de destino correto, com o identificador preservado.
- O teste deve verificar o repasse do header `Authorization` e da identidade autenticada.
- O teste deve verificar que um erro de cliente devolvido pelo proxy chega com o status original.
- O teste deve verificar que a rota responde `401` sem token e que, nesse caso, o proxy não é acionado.
- Esse teste não deve depender do `payments-service`, de banco de dados, de RabbitMQ ou de rede.

### RF-07 — Teste E2E da jornada completa

Deve existir um teste E2E que exercite, **exclusivamente através da porta do gateway**, a jornada completa de compra, incluindo o desfecho assíncrono do pagamento.

**Infraestrutura**

- O teste deve subir `users-service`, `products-service`, `checkout-service`, `payments-service` e o gateway a partir do build, aguardar a prontidão de cada um pelo respectivo health check, verificar previamente que as portas estão livres e encerrar os processos ao final, seguindo o padrão dos testes E2E reais já existentes no gateway.
- O preparo da suíte deve garantir que todos os serviços envolvidos estejam compilados antes da execução.
- Diferentemente dos E2E anteriores, este teste **exige um broker RabbitMQ em execução**, pois o pagamento só é processado quando a mensagem publicada pelo `checkout-service` é efetivamente consumida pelo `payments-service`.
- O teste exige também os bancos de dados dos quatro serviços.
- O gateway deve ser iniciado apontando para as URLs reais dos quatro serviços e com limites de rate limit suficientes para a jornada, que é mais longa que as anteriores.

**Jornada**

1. Registrar um seller e um buyer.
2. Autenticar como seller e criar dois produtos: um com preço que leve a um pagamento aprovado e outro com preço que leve a um pagamento recusado pela operadora.
3. Autenticar como buyer e consultar o catálogo de produtos, confirmando que os produtos criados aparecem.
4. Adicionar ao carrinho o produto de desfecho aprovado e consultar o carrinho.
5. Finalizar a compra, obtendo o pedido criado com status `pending`.
6. Consultar o pedido pela rota de pedidos.
7. Consultar o pagamento pela rota de pagamentos até que ele exista e esteja processado, confirmando desfecho **aprovado**.
8. Repetir a jornada de compra com o produto de desfecho recusado, confirmando desfecho **rejeitado**, com o motivo correspondente.

**Regras que o teste precisa respeitar**

- O desfecho do pagamento é decidido pelo **valor total do pedido**, não pelo preço unitário do produto. Um produto de preço terminado em `,99` só produz recusa se o total do pedido também terminar em `,99`; portanto a quantidade adicionada ao carrinho deve ser escolhida para que o total preserve o desfecho desejado.
- O valor total de cada pedido deve permanecer dentro do limite de aprovação do simulador, para que a recusa esperada seja a da operadora e não a de limite excedido.
- Cada finalização encerra o carrinho ativo; a segunda jornada deve montar um carrinho novo, sem itens da primeira.
- O processamento do pagamento é assíncrono e o simulador aplica latência: a consulta do pagamento deve ser feita com espera ativa, tolerando `404` enquanto a mensagem ainda não foi processada, com um limite de tempo que faça o teste falhar com diagnóstico claro em vez de travar.
- Nenhuma etapa da jornada pode chamar diretamente um serviço de domínio: todas as requisições devem passar pela porta do gateway.
- O teste deve limpar os dados que criar nos bancos envolvidos e poder ser executado repetidamente sem interferência entre execuções.
- Os testes E2E reais já existentes devem continuar passando sem alteração de comportamento.

## Regras de integração

- O gateway é apenas trânsito: nenhuma regra de pagamento, decisão de aprovação ou correlação de pedido pode ser reimplementada nele.
- O `payments-service` continua sendo a única fonte de verdade sobre pagamentos.
- O gateway não deve armazenar em cache respostas de pagamento, por serem específicas de usuário e mutáveis enquanto o processamento não termina.
- O status do pedido no `checkout-service` permanece `pending` após o pagamento: nesta etapa nada informa o resultado de volta, e o pedido e o pagamento são consultados separadamente.
- Os serviços de domínio continuam acessíveis diretamente em suas portas; esta especificação não introduz bloqueio de acesso direto.

## Restrições e fora de escopo

- Não alterar o `payments-service` em nada, inclusive para adicionar autenticação ou verificação de propriedade.
- Não alterar o `checkout-service` além da remoção do endpoint de teste descrita no RF-05.
- Não alterar o `ProxyService`, o circuit breaker, o retry, o timeout ou os serviços de fallback.
- Não alterar o `JwtAuthGuard`, a estratégia JWT ou o throttler do gateway.
- Não implementar webhook, consumidor de eventos no `checkout-service` ou qualquer atualização do status do pedido a partir do resultado do pagamento.
- Não expor pelo gateway as rotas de DLQ e de métricas do `payments-service`.
- Não criar rotas de estorno, cancelamento, reprocessamento ou listagem de pagamentos.
- Não introduzir cache de respostas de pagamento nem agregação de pedido com pagamento em uma única rota.
- Não alterar os módulos de usuários, produtos e checkout do gateway nem seus testes.

## Critérios de aceite

1. O gateway compila sem erros após a inclusão do módulo, do controller e do registro no `AppModule`.
2. A entrada `payments` da configuração de serviços tem destino padrão na porta do `payments-service`, mantém a precedência da variável de ambiente e preserva o timeout de 10000 ms.
3. O destino padrão da entrada `payments` é coerente com o default do schema de ambiente, e nenhuma outra entrada da configuração foi alterada.
4. Existe um módulo de pagamentos no gateway que importa o `ProxyModule`, declara apenas o controller de proxy e não declara services de negócio próprios.
5. O `PaymentsModule` está registrado no `AppModule`, e os módulos, guards, middleware e configurações preexistentes permanecem inalterados.
6. `GET /payments/:orderId` no gateway aciona o proxy com serviço `payments`, método `get` e caminho `/payments/` seguido do identificador recebido, com o valor preservado.
7. A rota repassa ao proxy o header `Authorization` recebido do cliente.
8. A rota repassa ao proxy a identidade autenticada da requisição.
9. A rota responde `401` sem token, com token malformado, expirado ou assinado com outro secret, e nesse caso o proxy não é acionado.
10. Um erro de cliente devolvido pelo `payments-service` chega ao cliente do gateway com o mesmo status, incluindo `400` para identificador inválido e `404` para pedido sem pagamento.
11. O corpo de uma resposta de sucesso chega idêntico ao devolvido pelo `payments-service`, sem envelopamento ou reformatação.
12. Com o `payments-service` indisponível, a resposta usa o fallback de `payments` já existente e não expõe stack trace, URL interna, host, porta ou detalhes de infraestrutura.
13. A rota aparece no Swagger do gateway sob a tag de pagamentos, declarada como autenticada por Bearer JWT e com descrição da operação.
14. A documentação das rotas de usuários, produtos, carrinho e pedidos permanece inalterada.
15. Não existem rotas de DLQ, métricas, estorno, cancelamento, reprocessamento ou listagem de pagamentos expostas pelo gateway.
16. O endpoint `POST /test/send-payment` não existe mais no `checkout-service`, e o controller correspondente e seu registro no módulo raiz foram removidos.
17. A cobertura que exercitava o endpoint de teste foi removida, e as demais verificações do mesmo arquivo de teste continuam existindo e passando.
18. `GET /health` do `checkout-service` continua público, respondendo com o mesmo contrato de antes.
19. Os endpoints de carrinho e de pedidos do `checkout-service` continuam funcionando com o mesmo comportamento e as mesmas respostas.
20. Os métodos públicos do serviço de publicação de pagamento do `checkout-service` permanecem existindo, com os mesmos nomes e assinaturas.
21. Nenhum arquivo do `payments-service` é alterado por esta entrega.
22. Existe cobertura de roteamento da nova rota que verifica serviço, método, caminho, repasse do identificador, repasse do `Authorization`, repasse da identidade, preservação de erro de cliente e recusa sem token.
23. O teste de roteamento não depende de `payments-service`, banco, RabbitMQ ou rede.
24. Existe um teste E2E que executa a jornada completa apenas pela porta do gateway: registro de seller e buyer, criação de produtos, navegação do catálogo, carrinho, checkout, consulta do pedido e consulta do pagamento.
25. O E2E sobe os quatro serviços e o gateway a partir do build, aguarda os health checks, verifica portas livres antes de iniciar e encerra os processos ao final.
26. O preparo da suíte garante que os quatro serviços estejam compilados antes da execução do E2E.
27. Nenhuma requisição do E2E é feita diretamente a um serviço de domínio.
28. No E2E, o catálogo consultado pelo buyer contém os produtos criados pelo seller.
29. No E2E, o carrinho consultado reflete o item adicionado e o total esperado.
30. No E2E, a finalização devolve um pedido com status `pending` e total igual ao do carrinho.
31. No E2E, o pedido criado é recuperável pela rota de consulta de pedido.
32. No E2E, o pagamento da primeira jornada é encontrado pela rota de pagamentos e termina com desfecho aprovado, com identificador de transação preenchido e sem motivo de recusa.
33. No E2E, o pagamento da segunda jornada termina com desfecho rejeitado e com o motivo de recusa da operadora.
34. No E2E, o valor de cada pagamento corresponde ao total do pedido correspondente.
35. A espera pelo processamento assíncrono tolera `404` enquanto a mensagem não foi consumida e falha com diagnóstico claro ao esgotar o tempo limite, em vez de travar.
36. A segunda jornada usa um carrinho novo, sem itens da primeira.
37. O E2E limpa os dados que criou nos bancos envolvidos e pode ser executado repetidamente sem interferência entre execuções.
38. O fluxo do E2E não é recusado pelo rate limit configurado no gateway.
39. Os testes de roteamento e os E2E reais preexistentes do gateway continuam passando sem alteração.
40. O `ProxyService`, o circuit breaker, o retry, o timeout, os fallbacks, o `JwtAuthGuard` e o throttler permanecem inalterados, e não existem webhooks ou atualização de status de pedido decorrentes desta entrega.

## Limitação conhecida

A rota `GET /payments/:orderId` passa a exigir um JWT válido **no gateway**, mas o `payments-service` continua sem autenticação e sem verificação de propriedade, e esta especificação proíbe alterá-lo. Na prática isso significa que **qualquer usuário autenticado que conheça um `orderId` consegue ler o pagamento de outro usuário**, incluindo valor, identificador do comprador e desfecho — a proteção adicionada é de autenticação, não de autorização.

O `payments-service` também continua acessível diretamente na porta 3004, sem token algum, para quem tiver acesso à rede interna.

Fechar essa lacuna exige que o `payments-service` valide o token emitido pelo `users-service` e restrinja a consulta ao dono do pagamento, comparando o `userId` do pagamento com o da identidade autenticada. Isso deve ser tratado em especificação própria e é o próximo passo recomendado antes de qualquer exposição pública do ambiente.
