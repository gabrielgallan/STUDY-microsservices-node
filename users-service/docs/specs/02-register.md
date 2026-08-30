# Registro de usuário

## Objetivo

Permitir o cadastro de novos vendedores e compradores no marketplace por meio do `users-service`, garantindo validação dos dados, unicidade do e-mail e armazenamento seguro da senha.

## Escopo

Esta especificação cobre somente o registro de um novo usuário pelo endpoint de autenticação.

Não fazem parte deste escopo login, logout, JWT, refresh token, recuperação ou alteração de senha, confirmação de e-mail, autorização, perfis, atualização de usuário, consulta de usuários ou qualquer outro endpoint.

## Requisitos funcionais

### RF-01 — Módulo de autenticação

- A aplicação deve possuir um `AuthModule` registrado no módulo raiz do `users-service`.
- O módulo deve possuir controller e service próprios para receber e executar o registro de usuários.
- O módulo deve utilizar o repositório da entidade `User` já pertencente ao módulo de usuários.
- O projeto deve incluir `bcryptjs` como dependência para proteção de senhas.

### RF-02 — Endpoint de registro

- Deve existir somente o endpoint `POST /auth/register` dentro do escopo desta especificação.
- O endpoint deve receber os dados definidos no DTO de criação de usuário.
- Quando os dados forem válidos e o e-mail estiver disponível, um único usuário deve ser persistido no banco.
- A criação bem-sucedida deve retornar o status HTTP `201`.

### RF-03 — Validação da entrada

- Todos os dados devem ser validados antes de qualquer persistência.
- A validação deve utilizar o suporte global a schemas Zod já configurado no serviço.
- Campos ausentes, vazios, com formato inválido, acima do tamanho permitido ou com valor fora das opções aceitas devem causar uma resposta HTTP `400`.
- A resposta de validação deve apresentar uma lista de erros clara, identificando o campo inválido e o motivo da rejeição.
- Quando mais de um campo estiver inválido, a resposta deve informar todos os erros identificados no payload.
- Uma requisição inválida não deve criar ou alterar registros no banco.

### RF-04 — Unicidade do e-mail

- Antes de cadastrar o usuário, o serviço deve verificar se já existe um registro com o mesmo e-mail.
- Quando o e-mail já estiver cadastrado, o serviço deve retornar o status HTTP `409` e informar claramente que o e-mail já está em uso.
- Uma tentativa duplicada não deve alterar o usuário existente nem criar outro registro.
- Qualquer conflito com a restrição de unicidade do e-mail deve resultar em `409`, inclusive quando causado por tentativas de cadastro concorrentes.

### RF-05 — Proteção da senha

- A senha recebida deve ser transformada em hash bcrypt antes da persistência.
- O bcrypt deve utilizar fator de custo de `10` salt rounds.
- A senha original nunca deve ser armazenada no banco.
- O hash persistido deve ser válido para comparação posterior com a senha original por meio do bcrypt.

### RF-06 — Criação do usuário

- O usuário deve ser criado com `email`, hash da senha, `firstName`, `lastName` e `role` provenientes da entrada validada.
- O status deve ser definido automaticamente como `active` e não deve fazer parte dos dados aceitos para registro.
- O identificador UUID e os timestamps devem continuar sendo gerados automaticamente conforme a entidade existente.

### RF-07 — Proteção dos dados de resposta

- Nenhuma resposta do endpoint deve conter o campo `password`, a senha original ou o hash armazenado.
- A restrição se aplica às respostas de sucesso, validação, conflito e erro.
- A resposta de sucesso deve conter somente os dados públicos definidos nesta especificação.

## Estrutura de dados

### DTO de criação de usuário

O corpo da requisição deve conter exatamente os dados de entrada abaixo:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `email` | string | Obrigatório, não vazio e com formato válido de e-mail |
| `password` | string | Obrigatório e com no mínimo 6 caracteres |
| `firstName` | string | Obrigatório, não vazio e com no máximo 100 caracteres |
| `lastName` | string | Obrigatório, não vazio e com no máximo 100 caracteres |
| `role` | enum | Obrigatório; aceita somente `seller` ou `buyer` |

O DTO não deve aceitar `id`, `status`, `createdAt`, `updatedAt` ou qualquer outro atributo da entidade como dado controlável pelo cliente.

### Dados públicos do usuário criado

A resposta de sucesso deve conter somente:

| Campo | Tipo | Origem |
| --- | --- | --- |
| `id` | UUID | Gerado automaticamente |
| `email` | string | Entrada validada |
| `firstName` | string | Entrada validada |
| `lastName` | string | Entrada validada |
| `role` | enum | `seller` ou `buyer`, conforme a entrada |
| `status` | enum | Sempre `active` no registro |
| `createdAt` | timestamp | Gerado automaticamente |
| `updatedAt` | timestamp | Gerado automaticamente |

## Respostas esperadas

### 201 — Usuário criado

- Indica que o registro foi persistido com sucesso.
- Retorna os dados públicos do usuário criado.
- Não retorna o campo `password` nem qualquer representação da senha.

### 400 — Dados inválidos

- Indica que um ou mais campos da entrada não atendem ao DTO.
- Retorna uma lista de erros contendo, para cada ocorrência, o campo afetado e uma mensagem que explique a regra violada.
- Não retorna dados sensíveis nem persiste parcialmente a requisição.

### 409 — E-mail já cadastrado

- Indica que já existe um usuário com o e-mail informado.
- Retorna uma mensagem clara de conflito de e-mail.
- Não retorna dados do usuário existente nem qualquer campo de senha.

## Critérios de aceite

1. O `AuthModule`, seu controller e seu service estão registrados e a aplicação compila sem erros.
2. O `POST /auth/register` é o único endpoint adicionado por esta especificação.
3. Uma requisição válida para cada role aceita cria um usuário e retorna `201` com exatamente os oito campos públicos definidos.
4. O usuário persistido recebe UUID, status `active`, `createdAt` e `updatedAt` sem que esses valores sejam controlados pela requisição.
5. O valor persistido em `password` é diferente da senha enviada, possui formato bcrypt com fator de custo `10` e corresponde à senha original em uma comparação bcrypt.
6. O campo `password`, a senha original e o hash não aparecem em nenhuma resposta do endpoint.
7. Uma segunda tentativa com um e-mail já cadastrado retorna `409`, mantém o registro original inalterado e não cria um novo usuário.
8. Tentativas concorrentes com o mesmo e-mail resultam em somente um usuário persistido; as tentativas conflitantes retornam `409`.
9. E-mail ausente, vazio ou com formato inválido retorna `400` e identifica o erro de `email`.
10. Senha ausente ou com menos de 6 caracteres retorna `400` e identifica o erro de `password`.
11. `firstName` ou `lastName` ausente, vazio ou com mais de 100 caracteres retorna `400` e identifica o respectivo campo.
12. Role ausente ou diferente de `seller` e `buyer` retorna `400` e identifica o erro de `role`.
13. Uma requisição com múltiplos campos inválidos retorna `400` com todos os erros identificados e não cria usuário.
14. Campos controlados pelo servidor, como `status`, não podem alterar o status inicial `active` quando enviados pelo cliente.
15. Nenhuma rota de login, JWT, recuperação de senha ou outra funcionalidade fora do escopo é adicionada.
