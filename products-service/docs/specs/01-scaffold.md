# Scaffold do products-service

## Objetivo

Disponibilizar o scaffold mínimo do `products-service`, responsável pelo catálogo de produtos do marketplace. O serviço deve ser um projeto NestJS independente, seguir as convenções dos demais microserviços deste repositório — especialmente do `users-service` — e ficar preparado para receber funcionalidades em especificações futuras.

## Escopo

Esta especificação cobre somente a base da aplicação, as dependências essenciais, a configuração de ambiente e banco de dados, o módulo básico de produtos, a entidade `Product` e a validação global baseada em Zod.

Não fazem parte deste escopo endpoints, controllers, DTOs, autenticação, autorização, regras de negócio, casos de uso, mensageria, integrações com outros serviços ou operações de criação, consulta, atualização e remoção de produtos.

## Requisitos funcionais

### RF-01 — Projeto NestJS

- O `products-service` deve ser um projeto NestJS independente, gerenciado com PNPM e compatível com a versão de NestJS adotada pelos demais microserviços do sistema.
- O projeto deve preservar a configuração estrita de TypeScript e as convenções de estrutura e formatação do repositório.
- O manifesto deve conter as dependências básicas geradas pelo NestJS CLI e somente as dependências adicionais essenciais ao scaffold: integração do NestJS com TypeORM, TypeORM, driver PostgreSQL `pg`, módulo de configuração do NestJS, Zod, dotenv e a integração necessária para disponibilizar o `ZodValidationPipe`.
- Dependências, scripts, arquivos de configuração, testes e exemplos criados automaticamente pela CLI que não sejam necessários ao scaffold final devem ser ajustados ou removidos para manter o projeto enxuto e alinhado ao `users-service`.
- A aplicação deve poder ser instalada, compilada e iniciada de forma independente dos demais microserviços.

### RF-02 — PostgreSQL via Docker Compose

- O serviço deve possuir um Docker Compose próprio com PostgreSQL baseado na imagem da Bitnami.
- O PostgreSQL deve publicar a porta `5432` do contêiner na porta `5436` da máquina local.
- O banco criado na inicialização deve se chamar `products`.
- Para o ambiente local do curso, o usuário e a senha do banco devem ser `docker`.
- Os dados do PostgreSQL devem permanecer em um volume nomeado exclusivo do `products-service`.
- O contêiner deve pertencer a uma rede exclusiva do `products-service`, seguindo a convenção dos demais serviços que usam PostgreSQL.

### RF-03 — Configuração de ambiente

- A aplicação deve possuir um módulo `Env` responsável por carregar, validar e disponibilizar as variáveis de ambiente.
- A configuração deve seguir o padrão do `users-service`: configuração global do NestJS, schema Zod e serviço tipado para leitura dos valores validados.
- O arquivo `.env` localizado na raiz do serviço deve ser suportado e não deve ser versionado.
- Valores inválidos devem impedir a inicialização e produzir uma mensagem que identifique as variáveis com erro.
- Os valores esperados para o ambiente local devem ser:

| Variável | Tipo | Valor local padrão | Finalidade |
| --- | --- | --- | --- |
| `NODE_ENV` | enum | `production` | Ambiente de execução; aceita `development`, `production` ou `test` |
| `PORT` | número inteiro válido para porta TCP | `3002` | Porta HTTP do `products-service` |
| `DB_HOST` | string não vazia | `localhost` | Host do PostgreSQL |
| `DB_PORT` | número inteiro válido para porta TCP | `5436` | Porta publicada pelo PostgreSQL |
| `DB_USERNAME` | string não vazia | `docker` | Usuário do PostgreSQL |
| `DB_PASSWORD` | string não vazia | `docker` | Senha do PostgreSQL |
| `DB_DATABASE` | string não vazia | `products` | Nome do banco PostgreSQL |

### RF-04 — Conexão com o banco de dados

- A aplicação deve possuir uma configuração central de TypeORM para PostgreSQL.
- Host, porta, usuário, senha e nome do banco devem vir exclusivamente dos valores disponibilizados pela configuração de ambiente validada.
- A configuração deve reconhecer as entidades pertencentes ao serviço tanto na execução do código-fonte quanto na aplicação compilada.
- A conexão deve ser registrada no módulo raiz da aplicação.
- O scaffold deve seguir o comportamento de sincronização de schema adotado pelo `users-service`, adequado ao ambiente didático deste projeto.

### RF-05 — Módulo de produtos

- Deve existir um módulo básico de produtos registrado no módulo raiz.
- O módulo deve ser responsável pela entidade `Product` e disponibilizar seu repositório TypeORM para futuras funcionalidades do próprio domínio.
- O módulo não deve declarar endpoints, controllers, casos de uso ou lógica de negócio nesta etapa.

### RF-06 — Validação global com Zod

- A aplicação deve registrar o `ZodValidationPipe` como pipe global antes de começar a aceitar requisições.
- O pipe deve ficar disponível para validar, em especificações futuras, DTOs definidos por schemas Zod.
- Nenhum DTO ou endpoint deve ser criado nesta etapa apenas para exercitar o pipe.

## Estrutura de dados

### Entidade Product

A entidade `Product` deve conter apenas os campos abaixo:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `name` | string | Obrigatório; limite de 255 caracteres |
| `description` | text | Obrigatório; armazenado como texto sem o limite de um varchar comum |
| `price` | decimal | Obrigatório; precisão 10 e escala 2 |
| `stock` | int | Obrigatório; valor padrão `0` |
| `sellerId` | UUID | Obrigatório; identifica o usuário vendedor sem relação TypeORM nem chave estrangeira, pois o usuário pertence a outro banco |
| `isActive` | boolean | Obrigatório; valor padrão `true` |
| `createdAt` | timestamp | Preenchido automaticamente na criação do registro |
| `updatedAt` | timestamp | Preenchido automaticamente na criação e atualizado a cada alteração do registro |

Não devem ser adicionados outros campos, relações, chaves estrangeiras, índices adicionais, enums ou dados derivados nesta especificação.

## Critérios de aceite

1. O diretório `products-service` contém um projeto NestJS independente, com manifesto e lockfile PNPM, e os comandos de instalação e compilação terminam sem erros.
2. O projeto usa versões de NestJS e TypeScript compatíveis com o `users-service`, mantém TypeScript estrito e não conserva arquivos, exemplos ou dependências da CLI sem utilidade para o scaffold final.
3. O manifesto contém TypeORM, a integração NestJS para TypeORM, `pg`, a configuração do NestJS, Zod, dotenv e a integração do `ZodValidationPipe`, sem dependências de autenticação, autorização, mensageria ou documentação de API.
4. A configuração do Docker Compose é válida, usa PostgreSQL da Bitnami, publica o banco em `localhost:5436`, cria o database `products` com as credenciais locais definidas e mantém os dados em volume próprio.
5. Com o PostgreSQL local disponível e valores de ambiente válidos, a aplicação inicia na porta `3002` por padrão e estabelece conexão com o database `products`.
6. Cada variável listada no RF-03 pode sobrescrever seu valor padrão, e o valor sobrescrito é usado pela aplicação ou pela conexão TypeORM conforme sua finalidade.
7. Uma porta fora do intervalo TCP, um valor de ambiente não aceito, host vazio, credencial vazia ou nome de database vazio faz a validação falhar antes de a aplicação começar a escutar requisições.
8. O módulo `Env` disponibiliza somente valores validados pelo schema Zod, por meio de acesso tipado compatível com o padrão do `users-service`.
9. O módulo raiz registra a configuração global, a conexão TypeORM, o módulo `Env` e o módulo de produtos.
10. O módulo de produtos registra a entidade `Product` e disponibiliza seu repositório TypeORM sem expor endpoints.
11. Os metadados da entidade `Product` apresentam exatamente os nove campos definidos nesta especificação, com tipos, limites, precisão, escala e valores padrão correspondentes à tabela.
12. A tabela de produtos não possui chave estrangeira nem relação de banco para `sellerId`.
13. Um novo produto recebe `0` como estoque e `true` como estado ativo quando esses valores não são informados, e os timestamps são mantidos automaticamente.
14. O `ZodValidationPipe` está registrado globalmente no bootstrap da aplicação.
15. O scaffold final não contém endpoints, controllers, DTOs, autenticação, autorização, lógica de negócio, mensageria ou integração com outros microserviços.
