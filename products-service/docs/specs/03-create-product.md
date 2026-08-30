# Criação de produto

## Objetivo

Permitir que um usuário autenticado com role `seller` cadastre um produto no catálogo por meio do `products-service`, garantindo validação da entrada, definição segura da propriedade do produto e persistência no PostgreSQL.

## Escopo

Esta especificação cobre somente a criação de um produto pelo endpoint `POST /products`, incluindo controller, service, DTO, validação de acesso, persistência e resposta do produto criado.

Não fazem parte deste escopo consulta, listagem, atualização, exclusão ou desativação de produtos, upload de imagens, categorias, variações, promoções, reserva de estoque, integração com outros serviços ou qualquer novo mecanismo global de autorização.

## Requisitos funcionais

### RF-01 — Módulo de produtos

- O `ProductsModule` deve registrar um `ProductsController` e um `ProductsService`.
- O service deve utilizar o repositório TypeORM da entidade `Product` já registrada no módulo.
- O controller deve receber requisições HTTP e delegar a criação ao service.
- O service deve concentrar a criação e persistência do produto.
- Nenhum outro módulo de domínio deve ser criado para esta funcionalidade.

### RF-02 — Endpoint de criação

- Deve existir somente o endpoint `POST /products` dentro do escopo desta especificação.
- O endpoint deve receber um corpo JSON compatível com o DTO de criação de produto.
- O endpoint não deve ser marcado com `@Public()` e deve permanecer protegido pelo guard JWT global existente.
- Uma requisição válida feita por um seller deve persistir exatamente um produto e retornar HTTP `201`.
- O endpoint não deve realizar login, validar credenciais ou emitir tokens.

### RF-03 — Autenticação e permissão de criação

- A identidade autenticada deve ser obtida exclusivamente de `req.user`, já preenchido pela validação JWT.
- Apenas identidades com role `seller` podem criar produtos.
- Uma identidade com role `buyer` deve receber HTTP `403` com uma mensagem clara de que apenas vendedores podem criar produtos.
- A rejeição de um buyer deve ocorrer antes da persistência e não pode criar ou alterar registros.
- A verificação deve pertencer ao fluxo de criação; não deve ser criado `RoleGuard`, decorator de roles ou outro guard global.
- O serviço não deve consultar o `users-service` nem procurar o usuário em banco para confirmar sua role.

### RF-04 — Propriedade do produto

- O campo `sellerId` do novo produto deve ser sempre igual ao `id` disponível em `req.user`.
- `sellerId` não deve fazer parte do DTO nem ser controlável pelo corpo da requisição.
- Nenhum valor enviado pelo cliente pode substituir ou modificar o `sellerId` obtido do token.
- A criação não deve gerar chave estrangeira, relação TypeORM ou consulta ao banco do `users-service`.

### RF-05 — Validação da entrada

- A entrada deve ser validada antes da execução da criação, utilizando a infraestrutura global de validação Zod já existente.
- O corpo aceito deve conter somente `name`, `description`, `price` e `stock`.
- Campos ausentes, vazios ou incompatíveis com o DTO devem retornar HTTP `400`.
- Strings numéricas não devem ser aceitas como `price` ou `stock`.
- Campos controlados pelo servidor, incluindo `id`, `sellerId`, `isActive`, `createdAt` e `updatedAt`, não devem ser aceitos no DTO.
- A resposta de validação deve identificar cada campo inválido e explicar de forma clara qual regra não foi atendida.
- Quando houver múltiplos campos inválidos, a resposta deve apresentar todos os erros identificados.
- Uma requisição inválida não deve criar nem alterar registros no banco.

### RF-06 — Persistência do produto

- O produto deve ser criado com `name`, `description`, `price` e `stock` provenientes exclusivamente da entrada validada.
- `sellerId` deve vir exclusivamente da identidade autenticada.
- `isActive` deve ser definido automaticamente como `true`, independentemente de qualquer valor enviado pelo cliente.
- O UUID, `createdAt` e `updatedAt` devem continuar sendo gerados automaticamente conforme a entidade existente.
- A criação bem-sucedida deve persistir todos os valores como um único produto.

### RF-07 — Resposta de sucesso

- A resposta HTTP `201` deve representar o produto efetivamente persistido.
- A resposta deve conter somente os campos públicos da entidade:

| Campo | Tipo | Origem |
| --- | --- | --- |
| `id` | UUID | Gerado automaticamente |
| `name` | string | Entrada validada |
| `description` | string | Entrada validada |
| `price` | decimal | Entrada validada |
| `stock` | inteiro | Entrada validada |
| `sellerId` | UUID | `req.user.id` |
| `isActive` | boolean | Sempre `true` na criação |
| `createdAt` | timestamp | Gerado automaticamente |
| `updatedAt` | timestamp | Gerado automaticamente |

- A resposta não deve incluir token JWT, e-mail, role ou qualquer outro dado do usuário autenticado.

## Estrutura de dados

### DTO de criação de produto

O corpo da requisição deve conter exatamente:

| Campo | Tipo | Regras |
| --- | --- | --- |
| `name` | string | Obrigatório, não vazio após remoção de espaços nas extremidades e com no máximo 255 caracteres |
| `description` | string | Obrigatório, texto livre e não vazio após remoção de espaços nas extremidades |
| `price` | número decimal | Obrigatório, finito, mínimo `0.01` e com no máximo duas casas decimais |
| `stock` | número inteiro | Obrigatório e mínimo `0` |

O DTO não deve conter nem aceitar `sellerId`, `isActive`, `id`, timestamps ou qualquer outro atributo controlado pelo servidor.

## Respostas esperadas

### 201 — Produto criado

- Indica que o produto foi persistido com sucesso.
- Retorna os nove campos públicos definidos no RF-07.
- `sellerId` corresponde ao usuário autenticado e `isActive` é `true`.

### 400 — Dados inválidos

- Indica que um ou mais campos não atendem ao DTO ou que o corpo contém campos não permitidos.
- Retorna erros claros, associados aos respectivos campos e regras violadas.
- Não persiste parcial ou integralmente a requisição.

### 401 — Não autenticado

- Ocorre quando o Bearer token está ausente, malformado, expirado ou inválido.
- A resposta segue o comportamento do guard JWT global existente.
- O controller e o service de criação não devem ser executados.

### 403 — Usuário sem permissão

- Ocorre quando o token é válido, mas a identidade possui role `buyer`.
- Retorna uma mensagem clara de que a criação é permitida somente para sellers.
- Não cria nem altera produtos.

## Critérios de aceite

1. `ProductsController` e `ProductsService` estão registrados no `ProductsModule`, e a aplicação compila sem erros.
2. `POST /products` é o único endpoint de produção adicionado por esta especificação.
3. O endpoint permanece protegido pelo guard JWT global e não possui marcação pública.
4. Uma requisição válida autenticada como seller retorna `201` e cria exatamente um produto no banco.
5. A resposta de sucesso contém exatamente `id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt` e `updatedAt`.
6. O produto persistido e a resposta usam `req.user.id` como `sellerId`.
7. `sellerId` enviado no corpo é rejeitado e nunca pode substituir o identificador do token.
8. O produto recebe `isActive` igual a `true`, e esse valor não pode ser controlado pelo corpo.
9. UUID e timestamps são preenchidos automaticamente e representam o registro persistido.
10. Uma requisição sem token, com token inválido ou expirado retorna `401` e não cria produto.
11. Uma requisição autenticada como buyer retorna `403`, informa que somente sellers podem criar produtos e não cria produto.
12. `name` ausente, vazio ou acima de 255 caracteres retorna `400` e identifica o erro de `name`.
13. `description` ausente ou vazia retorna `400` e identifica o erro de `description`.
14. `price` ausente, não numérico, menor que `0.01` ou com mais de duas casas decimais retorna `400` e identifica o erro de `price`.
15. `stock` ausente, não numérico, fracionário ou negativo retorna `400` e identifica o erro de `stock`.
16. Uma requisição com múltiplos campos inválidos retorna `400` com todos os erros identificados e não cria produto.
17. Os valores-limite válidos — nome com 255 caracteres, preço `0.01` e estoque `0` — são aceitos.
18. Campos controlados pelo servidor ou desconhecidos são rejeitados com `400` e não alteram os valores persistidos.
19. A implementação não adiciona `RoleGuard`, consulta ao `users-service` ou nova lógica global de autorização.
20. Nenhum endpoint de consulta, atualização ou exclusão, upload de imagem, categoria ou funcionalidade fora do escopo é adicionado.
21. Os testes existentes de scaffold e autenticação continuam passando após a implementação.
