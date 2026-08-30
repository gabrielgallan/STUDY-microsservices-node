# Login com JWT

## Objetivo

Permitir que usuários cadastrados e ativos autentiquem suas credenciais no `users-service` e recebam um token JWT com validade de 24 horas.

## Escopo

Esta especificação cobre somente a autenticação por e-mail e senha e a emissão de um JWT básico pelo módulo de autenticação existente.

Não fazem parte deste escopo proteção de rotas, guards, strategies de autorização, login pelo API Gateway, sessões, refresh tokens, revogação de tokens, logout, recuperação de senha, confirmação de e-mail ou qualquer outro endpoint.

## Requisitos funcionais

### RF-01 — Extensão do módulo de autenticação

- O `AuthModule` existente deve ser responsável também pelo login e pela emissão de JWT.
- O projeto deve incluir as dependências necessárias para JWT e Passport: `@nestjs/jwt`, `@nestjs/passport`, `passport` e `passport-jwt`.
- O bcryptjs já utilizado no registro deve ser utilizado para validar a senha informada.
- Nenhum novo módulo de autenticação paralelo deve ser criado.

### RF-02 — Endpoint de login

- Deve existir o endpoint `POST /auth/login`.
- O endpoint deve receber somente os campos definidos no DTO de login.
- O login bem-sucedido deve retornar o status HTTP `200`.
- O login não deve criar ou alterar dados do usuário no banco.

### RF-03 — Validação da entrada

- E-mail e senha devem ser validados antes da autenticação.
- A validação deve utilizar o suporte global a schemas Zod já configurado no serviço.
- O e-mail deve seguir a mesma normalização do registro: remoção de espaços externos e conversão para letras minúsculas.
- Campos ausentes, vazios, com formato inválido ou fora das regras do DTO devem retornar HTTP `400`.
- Campos adicionais não definidos no DTO devem ser rejeitados.
- A resposta de validação deve identificar os campos inválidos sem reproduzir a senha recebida.

### RF-04 — Validação das credenciais

- O serviço deve buscar o usuário pelo e-mail normalizado.
- Quando o e-mail não estiver cadastrado, o endpoint deve retornar HTTP `401` com a mensagem exata `Credenciais inválidas`.
- Quando o usuário existir, a senha fornecida deve ser comparada com o hash bcrypt armazenado.
- Quando a senha não corresponder ao hash, o endpoint deve retornar HTTP `401` com a mesma mensagem exata `Credenciais inválidas`.
- As respostas para e-mail inexistente e senha incorreta devem ser indistinguíveis em status e mensagem, sem revelar qual credencial falhou.
- Uma falha de credenciais nunca deve retornar dados do usuário ou token.

### RF-05 — Estado da conta

- Após a confirmação do e-mail e da senha, o status do usuário deve ser verificado.
- Um usuário com status `active` pode concluir o login.
- Um usuário com status `inactive` e senha correta deve receber HTTP `401` com a mensagem exata `Conta inativa`.
- Uma senha incorreta para uma conta inativa deve continuar retornando `Credenciais inválidas`, evitando revelar o estado da conta sem credenciais válidas.
- Uma conta inativa nunca deve receber token ou dados públicos do usuário.

### RF-06 — Emissão do JWT

- Um login válido de usuário ativo deve gerar um token JWT assinado.
- O token deve expirar 24 horas após sua emissão.
- A assinatura deve utilizar exclusivamente o secret disponibilizado pela variável de ambiente `JWT_SECRET`.
- `JWT_SECRET` deve ser obrigatório, não vazio e não possuir valor padrão.
- A ausência ou invalidade de `JWT_SECRET` deve impedir a inicialização da aplicação.
- O secret nunca deve aparecer em respostas, payloads do token ou mensagens de erro.
- O payload deve conter somente os claims de negócio definidos nesta especificação, além dos claims técnicos de emissão e expiração necessários ao JWT.

### RF-07 — Resposta do login

- A resposta de sucesso deve conter um objeto `user` e uma string `token`.
- `user` deve seguir o mesmo contrato público utilizado na resposta de registro.
- Nenhuma resposta deve conter o campo `password`, a senha recebida ou o hash armazenado.
- O JWT não deve conter senha, hash, nome, sobrenome, status, timestamps ou qualquer outro dado além dos claims permitidos.

## Estrutura de dados

### DTO de login

O corpo da requisição deve conter exatamente:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `email` | string | Obrigatório, não vazio e com formato válido de e-mail |
| `password` | string | Obrigatório e com no mínimo 6 caracteres |

### Payload JWT

O token deve representar os seguintes claims de negócio:

| Claim | Tipo | Conteúdo |
| --- | --- | --- |
| `sub` | UUID | Identificador do usuário autenticado |
| `email` | string | E-mail normalizado do usuário autenticado |
| `role` | enum | Role do usuário autenticado: `seller` ou `buyer` |

O token também deve possuir claims técnicos de emissão e expiração compatíveis com a validade de 24 horas. Nenhum outro dado da entidade `User` deve ser incluído.

### Usuário público

O objeto `user` da resposta deve conter somente:

| Campo | Tipo |
| --- | --- |
| `id` | UUID |
| `email` | string |
| `firstName` | string |
| `lastName` | string |
| `role` | enum `seller` ou `buyer` |
| `status` | enum `active` |
| `createdAt` | timestamp |
| `updatedAt` | timestamp |

### Resposta de sucesso

| Campo | Tipo | Conteúdo |
| --- | --- | --- |
| `user` | objeto | Usuário público autenticado, sem `password` |
| `token` | string | JWT assinado e válido por 24 horas |

## Respostas esperadas

### 200 — Login bem-sucedido

- Retorna o objeto `user` e o `token`.
- O token é válido, possui o payload esperado e expira em 24 horas.
- A resposta não contém senha ou hash.

### 400 — Dados inválidos

- Indica que o corpo não atende ao DTO de login.
- Retorna os erros de validação dos campos sem reproduzir valores sensíveis.
- Não executa login nem retorna token.

### 401 — Credenciais inválidas

- Utilizado quando o e-mail não existe ou a senha não corresponde ao hash.
- Retorna exatamente a mensagem `Credenciais inválidas` nos dois casos.
- Não retorna dados do usuário nem token.

### 401 — Conta inativa

- Utilizado somente quando e-mail e senha estão corretos, mas o usuário possui status `inactive`.
- Retorna exatamente a mensagem `Conta inativa`.
- Não retorna dados do usuário nem token.

## Critérios de aceite

1. O `POST /auth/login` está disponível no `AuthModule` existente e retorna `200` para credenciais válidas de uma conta ativa.
2. Logins válidos de usuários `seller` e `buyer` retornam um objeto `user` com exatamente os oito campos públicos e uma string `token` não vazia.
3. A senha original, o hash e o campo `password` não aparecem na resposta de sucesso, nas respostas de erro ou no payload JWT.
4. O token pode ser validado com o valor configurado em `JWT_SECRET` e é rejeitado quando validado com outro secret.
5. O payload validado contém `sub`, `email` e `role` correspondentes ao usuário autenticado.
6. A diferença entre os claims técnicos de expiração e emissão representa 24 horas.
7. O token não contém claims de negócio além de `sub`, `email` e `role`.
8. E-mail com variação de caixa ou espaços externos autentica o mesmo usuário cadastrado com e-mail normalizado.
9. E-mail inexistente retorna `401` com `Credenciais inválidas`, sem usuário ou token.
10. Senha incorreta retorna `401` com exatamente o mesmo formato e mensagem do cenário de e-mail inexistente.
11. Conta inativa com senha correta retorna `401` com `Conta inativa`, sem usuário ou token.
12. Conta inativa com senha incorreta retorna `401` com `Credenciais inválidas`, sem revelar o estado da conta.
13. E-mail ausente, vazio ou inválido e senha ausente ou com menos de 6 caracteres retornam `400` com os respectivos erros de validação.
14. Campos adicionais no DTO de login retornam `400` e não influenciam a autenticação.
15. A ausência de `JWT_SECRET` ou um valor vazio impede a aplicação de iniciar e identifica a variável inválida.
16. O login não altera senha, status, timestamps ou qualquer outro dado do usuário no banco.
17. Nenhum guard, rota protegida, sessão, refresh token, logout ou endpoint adicional é implementado nesta especificação.
