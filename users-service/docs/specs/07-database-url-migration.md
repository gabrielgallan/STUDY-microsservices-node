# Migração da configuração de banco para DATABASE_URL

## Objetivo

Unificar a configuração de banco de dados dos serviços em uma única variável de ambiente. Hoje cada serviço declara cinco variáveis (`DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE`) que precisam ser mantidas em conjunto no schema de ambiente, na configuração do TypeORM, nos arquivos `.env`, nos `setup-env` de teste e nos blocos de ambiente dos testes E2E do gateway — cinco pontos de edição para cada serviço, onde esquecer um campo só aparece em tempo de execução, na falha de conexão.

O `users-service` já foi migrado e serve de referência. Esta especificação estende a mesma mudança ao `products-service`, ao `checkout-service` e ao `payments-service`, e alinha os testes e arquivos de ambiente que ainda alimentam as variáveis antigas.

A migração é de **forma de configuração**, não de comportamento: host, porta, usuário, senha e nome de banco de cada serviço permanecem exatamente os mesmos.

## Escopo

Esta especificação cobre:

- o schema de ambiente (`src/env/env.ts`) do `products-service`, do `checkout-service` e do `payments-service`;
- a configuração do TypeORM (`src/config/database.config.ts`) desses três serviços;
- os arquivos `.env` e `.env.example` desses três serviços;
- os `test/setup-env.ts` do `products-service` e do `checkout-service`;
- o bloco `Environment schema` de `products-service/test/scaffold.e2e-spec.ts`;
- os blocos de ambiente dos serviços iniciados pelos testes E2E reais do `api-gateway`.

Não fazem parte deste escopo:

- o `users-service`, já migrado — esta especificação apenas registra seu estado como referência;
- o `api-gateway`, que não possui banco de dados: seu schema de ambiente declara apenas porta, segredo JWT, URLs dos serviços, CORS e limites de rate limit;
- o `messaging-service`;
- os arquivos `docker-compose.yml`, que descrevem os containers de banco e não a conexão da aplicação;
- qualquer alteração de credencial, porta, nome de banco, criação de migrations, pool de conexões, SSL ou qualquer opção do TypeORM além da forma de endereçar o banco;
- qualquer alteração de código de domínio, entidades, serviços, controllers ou testes que não estejam listados acima.

## Situação atual

| Projeto | Schema de ambiente | Configuração TypeORM | Arquivos de ambiente | Testes que dependem das variáveis |
| --- | --- | --- | --- | --- |
| `users-service` | **Migrado**: `DATABASE_URL` com default `postgresql://docker:docker@localhost:5435/users` | **Migrado**: `url: env.DATABASE_URL` | **Migrados**: `.env` e `.env.example` | Nenhum: o único teste de ambiente verifica apenas `JWT_SECRET` |
| `products-service` | Cinco variáveis `DB_*`, com `nonEmptyStringSchema` e `portSchema` | `host`/`port`/`username`/`password`/`database` | `.env` e `.env.example` com cinco linhas | `test/setup-env.ts` e o bloco `Environment schema` de `test/scaffold.e2e-spec.ts` |
| `checkout-service` | Cinco variáveis `DB_*`, com `z.string()` e `z.coerce.number()` | Idem, mais `synchronize` e `logging` derivados de `NODE_ENV` | `.env` e `.env.example` com cinco linhas | `test/setup-env.ts` (atribuição com `||=`) |
| `payments-service` | Cinco variáveis `DB_*`, com `z.string()` e `z.coerce.number()` | Idem, mais `synchronize` e `logging` derivados de `NODE_ENV` | `.env` e `.env.example` com cinco linhas | Nenhum |
| `api-gateway` | Sem variáveis de banco | Sem banco | — | Os três `*.real-e2e-spec.ts` passam `DB_*` aos serviços que iniciam |

Os quatro serviços importam `dotenv/config` no topo do `env.ts`. Isso significa que o `.env` da raiz do serviço é carregado **mesmo quando o processo é iniciado diretamente pelo `dist`**, como fazem os testes E2E do gateway, que não usam `--env-file`. Os arquivos `.env` não são, portanto, artefatos apenas de desenvolvimento: eles participam da execução dos testes.

## Contrato da variável

| Serviço | `DATABASE_URL` padrão | Porta publicada pelo compose |
| --- | --- | --- |
| `users-service` | `postgresql://docker:docker@localhost:5435/users` | 5435 |
| `products-service` | `postgresql://docker:docker@localhost:5436/products` | 5436 |
| `checkout-service` | `postgresql://docker:docker@localhost:5433/checkout` | 5433 |
| `payments-service` | `postgresql://docker:docker@localhost:5434/payments` | 5434 |

- Formato: `postgresql://usuario:senha@host:porta/banco`.
- Validação: `z.url()`, com `default` igual ao ambiente local descrito pelo `docker-compose.yml` do próprio serviço — a mesma forma já adotada no `users-service`.
- Cada default deve corresponder exatamente às credenciais, à porta e ao nome de banco que as cinco variáveis produziam antes, de modo que um serviço iniciado sem `.env` e sem variáveis de ambiente continue conectando no mesmo lugar.

## Requisitos funcionais

### RF-01 — Schema de ambiente

- Em cada um dos três serviços, as cinco entradas `DB_*` devem ser removidas do `envSchema` e substituídas por uma única entrada `DATABASE_URL`, validada com `z.url()` e com o default da tabela acima.
- Todas as demais entradas do schema devem permanecer inalteradas, incluindo `NODE_ENV`, `PORT`, `JWT_SECRET`, as URLs de serviços, as variáveis de RabbitMQ e, no `payments-service`, as do gateway de pagamento.
- Os helpers locais de cada schema (`portSchema`, `nonEmptyStringSchema`) devem ser preservados enquanto ainda forem usados por outras entradas, e removidos apenas se deixarem de ter uso.
- A rotina de validação na carga do módulo — `safeParse` sobre `process.env`, log do erro e `process.exit(1)` — deve permanecer exatamente como está, assim como as exportações `env` e `Env` de cada serviço, que diferem entre si e não devem ser uniformizadas nesta entrega.

### RF-02 — Configuração do TypeORM

- Em cada `database.config.ts`, as chaves `host`, `port`, `username`, `password` e `database` devem ser substituídas por `url: env.DATABASE_URL`.
- `type: 'postgres'` e o padrão de `entities` devem permanecer inalterados.
- As demais opções devem ser preservadas exatamente como estão em cada serviço: o `products-service` usa `synchronize: true`, enquanto `checkout-service` e `payments-service` derivam `synchronize` e `logging` do `NODE_ENV`. Esta entrega não uniformiza essa diferença.

### RF-03 — Arquivos de ambiente

- Em cada um dos três serviços, o `.env` e o `.env.example` devem ter as cinco linhas `DB_*` substituídas por uma única linha `DATABASE_URL`, com o valor da tabela de contrato.
- A linha deve permanecer sob o mesmo comentário de seção (`# Database`), preservando a ordem das demais seções e variáveis do arquivo.
- Nenhuma outra variável desses arquivos pode ser alterada, adicionada ou removida.

### RF-04 — Preparo de ambiente dos testes de serviço

- `products-service/test/setup-env.ts` deve definir `DATABASE_URL` no lugar das cinco atribuições `DB_*`, mantendo a forma de atribuição direta que o arquivo já usa.
- `checkout-service/test/setup-env.ts` deve definir `DATABASE_URL` no lugar das cinco atribuições, preservando o operador `||=`, que existe para não sobrescrever um valor já presente no ambiente.
- Os valores usados devem ser os mesmos que as cinco variáveis produziam, mantendo cada suíte apontando para o banco que ela já usava.
- `users-service/test/setup-env.ts` e `payments-service/test/setup-env.ts` não declaram variáveis de banco e não devem ser alterados.

### RF-05 — Cobertura de testes dos serviços

O arquivo `products-service/test/scaffold.e2e-spec.ts` verifica hoje o contrato das cinco variáveis em dois pontos, e ambos precisam ser migrados junto, no mesmo commit, sob pena de quebrar (ver "Impacto nos testes").

O teste `connects to the products database` afirma o banco conectado através de `dataSource.options.database`. Como o TypeORM parseia a URL para dentro do driver e não a reflete de volta em `dataSource.options`, essa propriedade passa a ser `undefined` quando a conexão é configurada por `url`. A verificação deve passar a ler o banco efetivamente conectado a partir do driver do TypeORM, preservando a intenção original do teste e as demais asserções de inicialização e de tipo de banco.

O bloco `Environment schema` do mesmo arquivo deve ser migrado assim:

- o caso de defaults locais deve passar a esperar `DATABASE_URL` com o default do serviço, no lugar das cinco chaves;
- o caso de overrides válidos deve passar a fornecer e esperar uma `DATABASE_URL` alternativa, mantendo a verificação de coerção de `PORT`, que não é afetada por esta migração;
- os casos de valores inválidos devem substituir as entradas de `DB_PORT`, `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE` por valores inválidos de `DATABASE_URL` — ao menos uma string que não é URL e uma string em branco;
- as verificações não relacionadas a banco — `NODE_ENV` inválido, `PORT` inválida, `JWT_SECRET` ausente ou em branco — devem continuar existindo com o mesmo comportamento.

Nenhum outro teste do arquivo pode ser alterado, em particular os que verificam o mapeamento de colunas da entidade, os valores automáticos e a ausência de endpoints HTTP.

O `checkout-service` tem uma asserção equivalente em `test/domain-entities.e2e-spec.ts`, no teste `connects to the checkout PostgreSQL database`, e precisa da mesma correção: ler o banco conectado a partir do driver do TypeORM, preservando as demais asserções e todos os outros testes do arquivo. Essa asserção não é encontrável por busca pelas variáveis `DB_*` — ela depende do formato interno das opções do TypeORM, e não do nome das variáveis de ambiente.

O `payments-service` e o `users-service` não possuem asserções sobre as opções de conexão e não precisam de ajuste.

### RF-06 — Testes E2E reais do api-gateway

- Nos três arquivos `*.real-e2e-spec.ts` do `api-gateway`, cada bloco de ambiente passado a `startService` deve substituir as cinco variáveis `DB_*` por `DATABASE_URL`, para o serviço correspondente.
- O destino de cada URL deve ser idêntico ao que as cinco variáveis endereçavam, preservando `127.0.0.1` como host (ver D-04).
- As demais variáveis passadas a cada serviço — `NODE_ENV`, `PORT`, `JWT_SECRET`, URLs de serviços, `RABBITMQ_URL`, variáveis do gateway de pagamento — devem permanecer inalteradas.
- As conexões diretas ao PostgreSQL feitas pelos próprios testes para preparar e limpar dados usam `host`, `port`, `user`, `password` e `database` do cliente `pg` e **não** fazem parte desta migração: elas não passam pelo schema de ambiente dos serviços.
- O `real-service-harness.ts` não deve ser alterado: ele repassa o ambiente recebido sem conhecer variáveis específicas.

### RF-07 — Preservação de comportamento

- Nenhum serviço pode passar a conectar em host, porta, usuário, senha ou banco diferentes dos atuais.
- Nenhuma variável de ambiente fora do domínio de banco pode ser alterada, renomeada ou ganhar novo default.
- Nenhum arquivo de código de domínio, entidade, serviço, controller, módulo ou guard pode ser alterado.
- Os `docker-compose.yml` dos serviços permanecem inalterados.
- Após a migração, um serviço iniciado sem `.env` e sem variáveis de ambiente deve continuar subindo e conectando no banco local do seu compose.

## Impacto nos testes

O levantamento abaixo é o motivo de a migração precisar tratar testes e código no mesmo commit.

| Suíte | Situação após a migração |
| --- | --- |
| `products-service/test/scaffold.e2e-spec.ts` | **Quebra em 9 casos** se o teste não for migrado junto (detalhe abaixo) |
| `checkout-service/test/domain-entities.e2e-spec.ts` | **Quebra em 1 caso**: `connects to the checkout PostgreSQL database` afirma `dataSource.options.database`, pelo mesmo motivo descrito no item 1 abaixo |
| `checkout-service/test/env.e2e-spec.ts` | Passa: verifica apenas a obrigatoriedade de `JWT_SECRET`, e `DATABASE_URL` tem default |
| `users-service/test/login.e2e-spec.ts` | Passa: a verificação de schema cobre apenas `JWT_SECRET` |
| Demais suítes dos quatro serviços | Passam, desde que os `setup-env` e os `.env` forneçam a nova variável apontando para o mesmo banco |
| `*.real-e2e-spec.ts` do `api-gateway` | Passam mesmo sem alteração, mas apenas por coincidência (ver "Risco conhecido") |
| `*routing*.e2e-spec.ts` e `proxy-client-errors.e2e-spec.ts` do `api-gateway` | Passam: não sobem serviços nem tocam em banco |

Os nove casos do `products-service`:

1. `connects to the products database` — a asserção sobre `dataSource.options.database` passa a comparar `undefined` com `'products'`. O TypeORM extrai host, porta, usuário, senha e banco da URL para o **driver**, mas não os copia de volta para as opções da fonte de dados; a linha que faria essa cópia está desativada no próprio código do driver PostgreSQL.
2. `provides the local defaults` — o `toEqual` enumera as cinco chaves `DB_*`, que deixam de existir no objeto validado.
3. `accepts valid overrides and coerces ports` — fornece as cinco chaves como override e espera recebê-las de volta; como o objeto Zod descarta chaves desconhecidas, o retorno traz `DATABASE_URL` no default.
4. a 9. `rejects an invalid %s value` — os seis casos de `DB_PORT` (`'0'`, `'65536'`), `DB_HOST`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE` (todos `'  '`) passam a ser chaves desconhecidas e, portanto, `safeParse` devolve sucesso onde o teste espera falha.

## Decisões de projeto

### D-01 — Default local preservado em cada serviço

Cada schema mantém um `default` apontando para o banco local do seu `docker-compose.yml`, como o `users-service` já faz. Isso preserva a propriedade de que qualquer serviço sobe sem configuração em ambiente de desenvolvimento e nos testes, e é o que mantém as suítes existentes verdes sem depender de novos arquivos de ambiente.

### D-02 — Validação com `z.url()`, sem exigir o esquema `postgresql`

A validação usa `z.url()`, idêntica à adotada no `users-service`, priorizando consistência entre os quatro serviços. Consequência aceita: uma URL sintaticamente válida mas de outro esquema — `http://...`, por exemplo — passa pela validação e só falha na conexão. Endurecer a validação para exigir esquema `postgresql`/`postgres` é uma melhoria legítima, mas deve valer para os quatro serviços de uma vez e fica fora desta entrega.

### D-03 — Compose e credenciais intocados

A migração muda apenas como a aplicação endereça o banco. Os containers, volumes, redes, usuário, senha, portas publicadas e nomes de banco permanecem exatamente como estão, o que mantém bancos já existentes em disco utilizáveis sem recriação.

### D-04 — `127.0.0.1` preservado nos testes E2E

Os blocos de ambiente dos testes E2E do gateway usam `127.0.0.1`, enquanto os defaults dos schemas usam `localhost`. A migração deve preservar `127.0.0.1` nas URLs dos testes, e não substituí-las pelo default: em Windows, `localhost` pode resolver primeiro para `::1`, e manter o endereço literal preserva exatamente o destino que os testes usam hoje.

### D-05 — Specs de scaffold anteriores não são reescritos

As tabelas de variáveis de ambiente em `users-service/docs/specs/01-scaffold.md` e `products-service/docs/specs/01-scaffold.md` descrevem as cinco variáveis. Elas registram o contrato vigente à época daquelas entregas e permanecem como estão; esta especificação passa a ser a fonte de verdade sobre a configuração de banco a partir daqui.

## Critérios de aceite

1. `products-service`, `checkout-service` e `payments-service` compilam e sobem sem erro após a migração.
2. Nenhum dos três schemas de ambiente declara `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` ou `DB_DATABASE`.
3. Cada um dos três schemas declara `DATABASE_URL` validada com `z.url()` e com o default exato da tabela de contrato.
4. As demais entradas dos três schemas permanecem inalteradas, incluindo defaults, ordem e helpers ainda em uso.
5. A rotina de validação e as exportações `env`/`Env` de cada serviço permanecem como estavam, sem uniformização entre serviços.
6. Cada `database.config.ts` usa `url: env.DATABASE_URL` e não referencia mais nenhuma variável `DB_*`.
7. `entities`, `type`, `synchronize` e `logging` de cada serviço permanecem com os valores e as origens que tinham antes.
8. `.env` e `.env.example` dos três serviços têm uma única linha de banco, com a URL correta, sob a mesma seção, e nenhuma outra variável alterada.
9. `products-service/test/setup-env.ts` e `checkout-service/test/setup-env.ts` definem `DATABASE_URL` apontando para o mesmo banco de antes, preservando a forma de atribuição de cada arquivo.
10. `users-service/test/setup-env.ts` e `payments-service/test/setup-env.ts` permanecem inalterados.
11. O bloco `Environment schema` do `scaffold.e2e-spec.ts` verifica o default de `DATABASE_URL`, um override válido e ao menos dois valores inválidos de URL, e não menciona mais nenhuma variável `DB_*`.
12. As verificações de `NODE_ENV`, `PORT` e `JWT_SECRET` do mesmo arquivo continuam existindo e passando, e o teste de conexão com o banco afirma o nome do banco a partir do driver do TypeORM, e não de `dataSource.options`.
13. Os três `*.real-e2e-spec.ts` do `api-gateway` passam `DATABASE_URL` a cada serviço iniciado, com `127.0.0.1` e o mesmo banco de antes, sem nenhuma variável `DB_*` remanescente.
14. As demais variáveis passadas a cada serviço nesses testes permanecem inalteradas.
15. `real-service-harness.ts` permanece inalterado.
16. As conexões diretas ao PostgreSQL feitas pelos testes para preparar e limpar dados permanecem inalteradas.
17. Uma busca por `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` e `DB_DATABASE` em código, testes e arquivos de ambiente dos quatro serviços não retorna nenhuma ocorrência — restando apenas as menções históricas nos specs de scaffold.
18. `pnpm test:e2e` de `users-service`, `products-service`, `checkout-service` e `payments-service` passa integralmente, com a infraestrutura de banco e de mensageria disponível.
19. `pnpm test:e2e` do `api-gateway` passa integralmente, incluindo os testes E2E reais, com bancos e RabbitMQ disponíveis.
20. Nenhum arquivo do `api-gateway` fora dos três `*.real-e2e-spec.ts` é alterado, e nenhum arquivo do `messaging-service` é alterado.
21. Os `docker-compose.yml` dos serviços permanecem inalterados.
22. Cada serviço iniciado sem `.env` e sem variáveis de ambiente conecta no mesmo banco local de antes.
23. O teste de entidades de domínio do `checkout-service` afirma o banco conectado a partir do driver do TypeORM, e não de `dataSource.options`, e continua passando.

## Risco conhecido

Depois desta migração, qualquer `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD` ou `DB_DATABASE` que sobreviva em um `.env`, em um script de CI, em um manifesto de deploy ou em um bloco de teste passa a ser **silenciosamente ignorado**: o objeto Zod descarta chaves desconhecidas e o serviço cai no default do schema, sem log nem erro. Enquanto o default apontar para o mesmo banco, nada falha e a divergência não aparece — foi exatamente isso que aconteceu com o `users-service`, cujos testes E2E continuaram verdes passando variáveis que já não eram lidas.

É por isso que o critério 17 exige a varredura completa por variáveis remanescentes, e não apenas a suíte verde: neste caso, teste passando não é evidência de configuração correta.
