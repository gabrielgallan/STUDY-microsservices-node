# Payment processing

## Objetivo

Fazer o `payments-service` efetivamente processar os pagamentos que já recebe do RabbitMQ. Hoje o consumer valida a mensagem publicada pelo `checkout-service` e apenas registra logs; ao final desta entrega cada mensagem consumida deve gerar um registro `Payment` persistido, com resultado aprovado ou recusado produzido por um gateway de pagamento simulado, e o resultado deve ficar consultável por um endpoint de leitura. A entrega também deve expor um health check simples do serviço.

## Escopo

Esta especificação cobre exclusivamente:

- a entidade `Payment` e seu módulo de domínio;
- o `FakePaymentGatewayService`, com simulação determinística de aprovação e recusa;
- o `PaymentsService`, com o processamento e a consulta por pedido;
- a substituição do trecho pendente do `PaymentConsumerService` pelo processamento real;
- o `PaymentsController`, com a consulta do pagamento de um pedido;
- o endpoint `GET /health`;
- o registro desses componentes nos módulos do serviço.

Não fazem parte deste escopo a integração com qualquer gateway de pagamento real, notificações de volta para o `checkout-service` por webhook ou mensageria, estorno, cancelamento, captura parcial, reembolso, antifraude, autenticação e autorização das rotas HTTP, e qualquer alteração nos endpoints existentes de DLQ e de métricas.

O `RabbitmqService`, o `PaymentsQueueService`, o `DlqService`, o `DlqController`, o `MetricsController`, a topologia de filas, o contrato `PaymentOrderMessage` e a política de retry e dead-letter existentes devem permanecer inalterados. No `PaymentConsumerService` é permitido apenas substituir o trecho pendente de processamento e integrar o novo serviço de domínio, preservando o restante do comportamento, inclusive as métricas.

## Situação atual

| Componente | Situação |
| --- | --- |
| `PaymentConsumerService` | Consome a fila, valida a mensagem com o schema da mensagem publicada e atualiza métricas; o processamento em si é apenas log |
| `PaymentsQueueService.consumePaymentOrder` | Assina `payment_queue` no exchange `payments` com routing key `payment.order` |
| Retry e DLQ | Implementados no `RabbitmqService`: a mensagem é confirmada quando o callback conclui e reenviada até um limite de tentativas quando o callback lança erro, indo para a dead-letter queue depois disso |
| Endpoints existentes | `GET /metrics`, `GET /metrics/health`, `GET /metrics/summary`, `POST /metrics/reset` e as rotas de `dlq` |
| Persistência | TypeORM configurado, carregando entidades por convenção de arquivo; ainda não existe nenhuma entidade |
| Health check do serviço | Não existe rota `GET /health`; o health atual é o do consumer, em `GET /metrics/health` |

O serviço não possui dependências de documentação OpenAPI nem de validação por schema em rotas HTTP. Esta especificação não exige a inclusão de nenhuma dependência nova.

## Estrutura de dados

A entidade `Payment` deve representar a tentativa de pagamento de um pedido e conter exatamente os seguintes campos:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `orderId` | UUID | Obrigatório; identifica o pedido no `checkout-service`, sem relação TypeORM ou chave estrangeira para outro banco |
| `userId` | UUID | Obrigatório; identifica o usuário no `users-service`, sem relação TypeORM ou chave estrangeira para outro banco |
| `amount` | decimal | Obrigatório; precisão 10 e escala 2 |
| `status` | enum | Obrigatório; aceita somente `pending`, `approved` ou `rejected`; padrão `pending` |
| `paymentMethod` | varchar | Obrigatório; limite de 50 caracteres |
| `transactionId` | varchar | Opcional; limite de 255 caracteres; nulo enquanto o pagamento não foi processado |
| `rejectionReason` | varchar | Opcional; limite de 255 caracteres; preenchido somente quando o pagamento é recusado |
| `processedAt` | timestamp | Opcional; nulo enquanto o pagamento não foi processado |
| `createdAt` | timestamp | Preenchido automaticamente na criação |
| `updatedAt` | timestamp | Preenchido automaticamente na criação e atualizado a cada alteração |

A entidade não deve receber campos, relações ou chaves estrangeiras adicionais nesta etapa. Os itens do pedido não são persistidos: o pagamento se correlaciona ao pedido por `orderId`.

Um pedido possui no máximo um registro `Payment`. Essa unicidade é requisito de negócio verificável e sustenta a consulta por `orderId`.

## Requisitos funcionais

### RF-01 — FakePaymentGatewayService

- Deve existir um serviço que simule um gateway de pagamento externo, isolado das regras de persistência e do consumer.
- O serviço deve expor uma operação de processamento que receba os dados necessários da cobrança e devolva um resultado com três informações: se foi aprovado, o identificador da transação e, quando recusado, o motivo da recusa.
- O identificador da transação deve ser gerado pelo próprio simulador, ser único por tentativa e ser devolvido tanto em aprovações quanto em recusas, pois identifica a tentativa junto ao suposto gateway.
- O serviço deve simular latência de rede antes de devolver o resultado, entre 500 ms e 2000 ms.
- A latência simulada deve ser controlável pelos testes automatizados, de modo que a suíte não fique lenta nem intermitente por causa da espera.
- O serviço não deve realizar nenhuma chamada de rede, não deve usar `PAYMENT_GATEWAY_URL` nem `PAYMENT_GATEWAY_API_KEY`, e não deve depender de banco de dados.
- As regras de decisão devem ser determinísticas, sem aleatoriedade, e avaliadas na seguinte ordem de precedência:

| Ordem | Condição | Resultado | Motivo |
| --- | --- | --- | --- |
| 1 | Valor maior que `10000` | Recusado | `Limite excedido` |
| 2 | Valor cujos centavos são `99` | Recusado | `Cartão recusado pela operadora` |
| 3 | Demais valores | Aprovado | — |

- A precedência importa: um valor que satisfaça as duas primeiras condições, como `10000.99`, deve ser recusado por `Limite excedido`.
- O valor exatamente igual a `10000` não excede o limite e deve seguir para as regras seguintes.
- A verificação dos centavos deve ser feita sobre o valor monetário em centavos, e não sobre resto de divisão em ponto flutuante, para que valores como `10.99` e `1999.99` sejam reconhecidos de forma confiável.
- O motivo da recusa deve ser exatamente o texto definido na tabela, para que seja verificável por teste e persistível no limite de 255 caracteres.

### RF-02 — PaymentsService: processamento

- Deve existir um serviço de domínio responsável por processar uma mensagem de ordem de pagamento e por consultar pagamentos.
- O processamento deve, nesta ordem: registrar o pagamento com status `pending`, acionar o gateway simulado, aplicar o resultado ao registro e persistir o desfecho.
- O registro criado deve copiar `orderId`, `userId`, `amount` e `paymentMethod` da mensagem recebida, sem recalcular ou inferir valores.
- Um resultado aprovado deve levar o pagamento a `approved`, com `transactionId` preenchido, `rejectionReason` nulo e `processedAt` preenchido.
- Um resultado recusado deve levar o pagamento a `rejected`, com `rejectionReason` preenchido, `transactionId` preenchido e `processedAt` preenchido.
- Um pagamento não deve permanecer em `pending` após um processamento concluído, seja qual for o desfecho.
- O serviço deve ser idempotente por pedido: uma mensagem repetida do mesmo `orderId` — situação esperada, já que existem retry e reprocessamento de dead-letter — não deve criar um segundo registro nem acionar o gateway novamente para um pedido já processado.
- O tratamento de uma mensagem repetida deve ser concluído com sucesso, devolvendo o pagamento já existente, sem alterar seu desfecho anterior.
- O serviço deve normalizar os valores decimais lidos do banco antes de devolvê-los.

### RF-03 — PaymentsService: consulta

- O serviço deve expor a consulta de um pagamento pelo `orderId`.
- Quando não existir pagamento para o pedido informado, a consulta deve sinalizar recurso não encontrado, resultando em HTTP `404`.
- A consulta não deve acionar o gateway simulado nem alterar qualquer registro.

### RF-04 — Integração no PaymentConsumerService

- O trecho pendente de processamento deve ser substituído pela chamada real ao processamento do `PaymentsService`, usando a mensagem já validada.
- A validação da mensagem, o formato dos logs de recebimento, a contabilização de métricas, o tratamento de erro existente e a assinatura da fila devem ser preservados.
- Um pagamento **recusado é um processamento bem-sucedido**: o consumer não deve lançar erro nesse caso. A mensagem deve ser confirmada e contabilizada como sucesso nas métricas, para que uma recusa de negócio nunca provoque retry nem envio para a dead-letter queue.
- Uma falha técnica no processamento — indisponibilidade do banco, erro inesperado do gateway simulado ou qualquer exceção não prevista — deve continuar propagando o erro, para que a política de retry e de dead-letter existente atue como já atua hoje.
- Uma mensagem fora do contrato deve continuar sendo rejeitada antes de qualquer escrita, sem criar registro de pagamento.
- O consumer não deve acumular estado de pagamento em memória nem duplicar as regras de decisão do gateway simulado.

### RF-05 — PaymentsController

- Deve existir o endpoint `GET /payments/:orderId`, que devolve o pagamento correspondente ao pedido informado.
- O `orderId` deve ser validado como UUID antes de qualquer acesso ao banco, resultando em HTTP `400` quando inválido.
- Um pedido sem pagamento registrado deve resultar em HTTP `404`.
- A resposta deve conter `id`, `orderId`, `userId`, `amount`, `status`, `paymentMethod`, `transactionId`, `rejectionReason`, `processedAt`, `createdAt` e `updatedAt`.
- `amount` deve ser devolvido como número, e não como a representação textual que o driver do banco usa para colunas decimais.
- O endpoint não deve permitir criação, alteração ou remoção de pagamentos, nem disparar reprocessamento.
- O controller não deve conter regra de negócio: a decisão de existência e o formato do dado vêm do serviço de domínio.

### RF-06 — Health check

- Deve existir o endpoint `GET /health`, respondendo com HTTP `200` e um corpo que identifique o serviço como saudável.
- O endpoint não deve consultar banco de dados, RabbitMQ ou outros serviços para produzir a resposta.
- O health check existente do consumer, em `GET /metrics/health`, deve permanecer inalterado e continuar respondendo com o mesmo contrato; os dois endpoints têm propósitos distintos e devem coexistir.

### RF-07 — Registro dos componentes

- Deve existir um módulo de domínio de pagamentos que registre a entidade `Payment` no TypeORM e declare o `PaymentsService`, o `FakePaymentGatewayService` e o `PaymentsController`.
- O módulo deve exportar o que o `EventsModule` precisar para que o consumer acione o processamento, sem que o `EventsModule` redeclare a entidade nem instancie um segundo serviço de domínio.
- O módulo de domínio e o `EventsModule` devem se relacionar sem dependência circular.
- O módulo raiz deve registrar o novo módulo de domínio e o componente responsável pelo health check, preservando os módulos e a configuração já existentes.
- A conexão TypeORM existente deve reconhecer a nova entidade e criar sua tabela conforme a política de sincronização já configurada para o ambiente.

## Regras de negócio

- Todo pagamento nasce com status `pending` e termina em `approved` ou `rejected` dentro do mesmo processamento.
- Cada pedido possui no máximo um pagamento; reprocessar a mesma ordem não cobra duas vezes nem cria um segundo registro.
- A decisão de aprovação é determinística e derivada apenas do valor, conforme as regras do simulador, sem consultar usuário, pedido ou produto.
- Um pagamento recusado é um desfecho de negócio legítimo e definitivo nesta etapa: não há nova tentativa automática, e a recusa não é tratada como falha de processamento.
- O valor cobrado é o `amount` recebido na mensagem; o serviço não recalcula totais nem consulta o `checkout-service`.
- O `rejectionReason` só existe em pagamentos recusados.
- O `processedAt` marca o instante da decisão do gateway simulado, não o da criação do registro.
- O `payments-service` não informa o resultado de volta ao `checkout-service` nesta etapa; a consulta é feita sob demanda pelo endpoint de leitura.

## Fluxo esperado de processamento

1. O `checkout-service` publica a ordem de pagamento no exchange `payments`.
2. O `payments-service` consome a mensagem de `payment_queue`.
3. O consumer valida a mensagem contra o contrato já existente.
4. O processamento verifica se o pedido já possui pagamento registrado e, em caso positivo, encerra devolvendo o registro existente.
5. Não havendo pagamento, um registro `pending` é criado com os dados da mensagem.
6. O gateway simulado é acionado e, após a latência simulada, devolve aprovação ou recusa.
7. O registro é atualizado para `approved` ou `rejected`, com identificador da transação, motivo quando houver e instante do processamento.
8. O consumer confirma a mensagem e contabiliza sucesso nas métricas, inclusive quando o pagamento foi recusado.
9. O resultado fica disponível em `GET /payments/:orderId`.

## Restrições e fora de escopo

- Não integrar com gateway de pagamento real, nem realizar chamadas HTTP de cobrança.
- Não notificar o `checkout-service` do resultado, por webhook, mensageria ou chamada direta.
- Não atualizar o status do pedido no `checkout-service`.
- Não implementar estorno, cancelamento, captura parcial, reembolso, retentativa manual de cobrança ou antifraude.
- Não alterar os endpoints existentes de DLQ e de métricas, nem seus contratos de resposta.
- Não alterar a topologia de filas, o exchange, a routing key, a política de retry ou a dead-letter queue.
- Não alterar o contrato `PaymentOrderMessage` nem sua validação.
- Não introduzir autenticação, autorização por role ou emissão de token nesta etapa.
- Não introduzir documentação OpenAPI, dependências novas de validação ou bibliotecas de terceiros.
- Não persistir os itens do pedido no `payments-service`.

## Critérios de aceite

1. O projeto compila sem erros após a inclusão da entidade, do módulo de domínio, dos serviços, do controller e do health check.
2. Os metadados TypeORM de `Payment` apresentam exatamente os campos, tipos, limites, precisão, escala, padrão, nulidade e timestamps definidos nesta especificação, sem relações nem chaves estrangeiras.
3. Um `Payment` criado sem status informado recebe `pending`, e `transactionId`, `rejectionReason` e `processedAt` nascem nulos.
4. A tabela de pagamentos é criada pela conexão TypeORM existente, sem alteração da configuração de banco.
5. O gateway simulado recusa um valor maior que `10000` com o motivo exato `Limite excedido`.
6. O gateway simulado recusa um valor cujos centavos são `99` com o motivo exato `Cartão recusado pela operadora`.
7. O gateway simulado recusa `10000.99` por `Limite excedido`, comprovando a precedência da regra de limite.
8. O gateway simulado aprova o valor exatamente igual a `10000`.
9. O gateway simulado aprova valores comuns, como `100` e `49.90`.
10. Valores como `10.99` e `1999.99` são reconhecidos como terminados em `99` de forma confiável, sem depender de comparação em ponto flutuante.
11. O gateway simulado devolve um identificador de transação não vazio tanto em aprovações quanto em recusas, e identificadores distintos em tentativas distintas.
12. O gateway simulado devolve motivo de recusa apenas quando o resultado é recusado.
13. O gateway simulado aplica latência simulada entre 500 ms e 2000 ms na execução normal, e essa latência é controlável nos testes, que não dependem da espera real.
14. O gateway simulado não realiza chamadas de rede e não usa as variáveis de ambiente de gateway de pagamento.
15. Processar uma mensagem válida cria exatamente um registro `Payment` com `orderId`, `userId`, `amount` e `paymentMethod` iguais aos da mensagem.
16. Um pagamento aprovado termina com status `approved`, `transactionId` preenchido, `rejectionReason` nulo e `processedAt` preenchido.
17. Um pagamento recusado termina com status `rejected`, `rejectionReason` preenchido, `transactionId` preenchido e `processedAt` preenchido.
18. Nenhum pagamento permanece com status `pending` após um processamento concluído.
19. Processar duas vezes a mesma ordem mantém um único registro, não aciona o gateway na segunda vez e preserva o desfecho da primeira.
20. O processamento de uma ordem repetida conclui com sucesso, sem lançar erro.
21. `GET /payments/:orderId` devolve o pagamento do pedido, com todos os campos definidos no contrato de resposta.
22. `GET /payments/:orderId` responde `400` quando o `orderId` não é um UUID válido.
23. `GET /payments/:orderId` responde `404` para um pedido sem pagamento registrado.
24. `amount` é devolvido como número em todas as respostas, e não como representação textual de decimal.
25. `GET /payments/:orderId` não cria, altera nem remove registros, e não aciona o gateway simulado.
26. O consumer, ao receber uma mensagem válida, aciona o processamento do serviço de domínio e o pagamento correspondente é persistido.
27. Uma mensagem cujo pagamento é recusado é contabilizada como sucesso nas métricas do consumer e não provoca lançamento de erro.
28. Uma mensagem cujo pagamento é recusado não é reenviada para retry nem para a dead-letter queue.
29. Uma falha técnica durante o processamento propaga o erro, é contabilizada como falha nas métricas e permanece sujeita à política de retry e dead-letter existente.
30. Uma mensagem fora do contrato continua sendo rejeitada antes de qualquer escrita e não gera registro de pagamento.
31. O formato dos logs de recebimento, a validação da mensagem e a assinatura da fila do consumer permanecem inalterados.
32. `GET /health` responde `200` identificando o serviço como saudável, sem consultar banco, RabbitMQ ou outros serviços.
33. `GET /metrics/health` continua respondendo com o mesmo contrato de antes, e as duas rotas coexistem sem conflito.
34. `GET /metrics`, `GET /metrics/summary`, `POST /metrics/reset` e todas as rotas de `dlq` permanecem com o mesmo comportamento e o mesmo contrato de resposta.
35. O módulo de domínio registra a entidade `Payment`, o `PaymentsService`, o `FakePaymentGatewayService` e o `PaymentsController`.
36. O consumer acessa o processamento pelo serviço de domínio exportado, sem redeclarar a entidade e sem instanciar um segundo serviço.
37. A aplicação inicia sem dependência circular entre o módulo de domínio e o `EventsModule`.
38. O `RabbitmqService`, o `PaymentsQueueService`, o `DlqService`, o contrato `PaymentOrderMessage`, o exchange, a routing key, a fila, a política de retry e a dead-letter queue permanecem inalterados.
39. Não existem chamadas a gateway de pagamento real, webhooks, notificações ao `checkout-service` ou rotas de estorno, cancelamento e reembolso decorrentes desta entrega.
40. Nenhuma dependência nova é adicionada ao manifesto do serviço.

## Limitação conhecida

O endpoint `GET /payments/:orderId` fica **sem autenticação** nesta etapa, porque o `payments-service` ainda não possui infraestrutura de validação de JWT — diferentemente do `products-service` e do `checkout-service`, que já validam o token emitido pelo `users-service`. Na prática, qualquer requisição que conheça um `orderId` consegue ler valor, usuário e desfecho do pagamento correspondente.

A decisão é deliberada para manter o escopo desta entrega, e o endpoint não é exposto pelo `api-gateway` até que exista proteção. Proteger a rota e restringir a consulta ao dono do pedido deve ser tratado em especificação própria, antes de o serviço ser exposto publicamente.
