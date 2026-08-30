# Scaffold do users-service

## Objetivo

Disponibilizar o scaffold mínimo do `users-service`, responsável por manter os dados de usuários do marketplace. O serviço deve seguir as convenções dos demais microserviços NestJS deste repositório e estar preparado para receber funcionalidades em especificações futuras.

## Escopo

Esta especificação cobre somente a estrutura inicial da aplicação, a configuração de ambiente e banco de dados, o módulo básico de usuários, a entidade `User` e a validação global de DTOs.

Não fazem parte deste escopo endpoints, controllers, autenticação, autorização, emissão ou validação de tokens, hash de senha, casos de uso, regras de negócio, mensageria, integrações com outros serviços ou operações de cadastro, consulta, atualização e remoção de usuários.

## Requisitos funcionais

### RF-01 — Projeto NestJS

- O `users-service` deve ser um projeto NestJS independente, gerenciado com PNPM e compatível com a versão de NestJS usada pelos demais microserviços do sistema.
- O projeto deve manter a configuração estrita de TypeScript e as convenções de formatação do repositório.
- O manifesto deve conter somente as dependências essenciais ao scaffold, incluindo a integração NestJS com TypeORM, TypeORM, o driver PostgreSQL `pg`, o módulo de configuração do NestJS, Zod e dotenv, além das dependências básicas do NestJS.
- A aplicação deve poder ser instalada, compilada e iniciada de forma independente dos demais microserviços.

### RF-02 — PostgreSQL via Docker Compose

- O serviço deve possuir um Docker Compose próprio com um PostgreSQL baseado na imagem da Bitnami.
- O PostgreSQL deve publicar a porta `5432` do contêiner na porta `5435` da máquina local.
- O banco criado na inicialização deve se chamar `users`.
- Para o ambiente local do curso, o usuário e a senha do banco devem ser `docker`.
- Os dados do PostgreSQL devem permanecer em um volume nomeado exclusivo do `users-service`.
- O contêiner deve pertencer a uma rede exclusiva do `users-service`, seguindo a convenção dos serviços de checkout e pagamentos.

### RF-03 — Configuração de ambiente

- A aplicação deve possuir um módulo `Env` responsável por carregar, validar e disponibilizar as variáveis de ambiente.
- A configuração deve seguir o padrão dos outros microserviços: configuração global do NestJS, schema Zod e serviço tipado para leitura dos valores validados.
- O arquivo `.env` localizado na raiz do serviço deve ser suportado e não deve ser versionado.
- Valores inválidos devem impedir a inicialização e produzir uma mensagem que identifique as variáveis com erro.
- Os valores locais esperados devem ser:

| Variável | Tipo | Valor local padrão | Finalidade |
| --- | --- | --- | --- |
| `PORT` | número inteiro válido para porta TCP | `3001` | Porta HTTP do `users-service` |
| `DB_HOST` | string não vazia | `localhost` | Host do PostgreSQL |
| `DB_PORT` | número inteiro válido para porta TCP | `5435` | Porta do PostgreSQL |
| `DB_USERNAME` | string não vazia | `docker` | Usuário do PostgreSQL |
| `DB_PASSWORD` | string não vazia | `docker` | Senha do PostgreSQL |
| `DB_DATABASE` | string não vazia | `users` | Nome do banco PostgreSQL |

### RF-04 — Conexão com o banco de dados

- A aplicação deve possuir uma configuração central de TypeORM para PostgreSQL.
- Host, porta, usuário, senha e nome do banco devem vir exclusivamente dos valores disponibilizados pelo módulo `Env`.
- A configuração deve reconhecer as entidades pertencentes ao serviço quando executada a partir do código-fonte ou da aplicação compilada.
- A conexão deve ser registrada no módulo raiz da aplicação.

### RF-05 — Módulo de usuários

- Deve existir um módulo básico de usuários registrado no módulo raiz.
- O módulo deve ser responsável pela entidade `User` e disponibilizar seu repositório TypeORM para futuras funcionalidades do próprio domínio.
- O módulo não deve declarar endpoints, controllers, casos de uso ou lógica de negócio nesta etapa.

### RF-06 — Validação global de DTOs

- A aplicação deve registrar um `ZodValidationPipe` como pipe global antes de começar a aceitar requisições.
- O pipe deve estar disponível para validar, em especificações futuras, DTOs definidos por schemas Zod.
- Nenhum DTO ou endpoint deve ser criado nesta etapa apenas para exercitar o pipe.

## Estrutura de dados

### Entidade User

A entidade `User` deve conter somente os campos abaixo:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `id` | UUID | Chave primária gerada automaticamente |
| `email` | string | Obrigatório e único |
| `password` | string | Obrigatório e destinado exclusivamente ao armazenamento do hash da senha; nunca deve representar senha em texto puro |
| `firstName` | string | Obrigatório |
| `lastName` | string | Obrigatório |
| `role` | enum | Obrigatório; aceita somente `seller` ou `buyer` |
| `status` | enum | Obrigatório; aceita somente `active` ou `inactive`; valor padrão `active` |
| `createdAt` | timestamp | Preenchido automaticamente na criação do registro |
| `updatedAt` | timestamp | Preenchido automaticamente na criação e atualizado a cada alteração do registro |

Não devem ser adicionados outros campos, relações, índices adicionais, dados de perfil ou informações de autenticação nesta especificação.

## Critérios de aceite

1. O diretório `users-service` contém um projeto NestJS independente, com manifesto e lockfile PNPM, e sua compilação termina sem erros.
2. O manifesto contém as dependências essenciais descritas no RF-01 e não inclui pacotes de autenticação, autorização ou mensageria.
3. A configuração do Docker Compose é válida, utiliza PostgreSQL da Bitnami, expõe o banco em `localhost:5435`, cria o database `users` e mantém os dados em volume próprio.
4. Com o PostgreSQL local disponível e valores de ambiente válidos, a aplicação inicia na porta configurada e estabelece a conexão com o database `users`.
5. Cada uma das seis variáveis listadas pode sobrescrever seu valor local padrão, e o valor sobrescrito é usado pela aplicação ou pela conexão TypeORM conforme sua finalidade.
6. Um valor inválido de porta, host vazio, credencial vazia ou nome de database vazio faz a validação de ambiente falhar antes de a aplicação começar a escutar requisições.
7. O módulo `Env` disponibiliza à aplicação somente valores que já tenham sido validados pelo schema Zod, por meio de acesso tipado compatível com o padrão dos demais serviços.
8. O módulo raiz registra a conexão TypeORM e o módulo de usuários, e o módulo de usuários registra a entidade `User` sem expor endpoints.
9. Os metadados da entidade `User` apresentam exatamente os nove campos definidos nesta especificação, com UUID automático, unicidade de e-mail, enums e timestamps configurados conforme a tabela.
10. Um novo registro recebe `active` como status quando nenhum status é informado, e os timestamps de criação e atualização são preenchidos automaticamente.
11. O `ZodValidationPipe` está registrado globalmente no bootstrap da aplicação.
12. O scaffold não contém rotas de usuários, fluxo de autenticação, hash de senha, lógica de negócio nem integração com outros microserviços.
