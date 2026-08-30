# Consultas essenciais de produtos

## Objetivo

Disponibilizar as consultas mínimas de produtos necessárias ao funcionamento do marketplace, permitindo navegar pelo catálogo ativo, visualizar os produtos ativos de um vendedor e consultar um produto específico.

## Escopo

Esta especificação cobre exclusivamente os endpoints `GET /products`, `GET /products/seller/:sellerId` e `GET /products/:id` no `products-service`.

Não fazem parte deste escopo atualização, exclusão ou desativação de produtos, paginação, filtros adicionais, ordenação configurável, busca por texto, categorias, imagens, variações, promoções, reserva de estoque ou qualquer novo endpoint.

O endpoint existente `POST /products` e suas regras de autenticação e autorização não devem ser alterados.

## Contrato público de produto

Todo produto retornado pelos endpoints desta especificação deve representar os dados atuais armazenados no banco e conter os campos públicos da entidade `Product`:

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `id` | UUID | Identificador do produto |
| `name` | string | Nome do produto |
| `description` | string | Descrição do produto |
| `price` | decimal | Preço do produto |
| `stock` | inteiro | Quantidade disponível em estoque |
| `sellerId` | UUID | Identificador do vendedor proprietário |
| `isActive` | boolean | Indica se o produto está ativo |
| `createdAt` | timestamp | Data de criação |
| `updatedAt` | timestamp | Data da última atualização |

## Requisitos funcionais

### RF-01 — Listagem do catálogo ativo

- Deve existir o endpoint `GET /products`.
- O endpoint deve retornar todos e somente os produtos com `isActive` igual a `true`.
- Os produtos devem ser ordenados por `createdAt` em ordem decrescente, com os mais recentes primeiro.
- Quando não houver produtos ativos, a resposta deve ser HTTP `200` com uma lista vazia.
- Cada item da lista deve seguir o contrato público de produto desta especificação.
- A listagem deve ser pública por meio da marcação `@Public()` e não deve exigir token JWT.

### RF-02 — Listagem de produtos ativos por vendedor

- Deve existir o endpoint `GET /products/seller/:sellerId`.
- O parâmetro `sellerId` representa o UUID do vendedor consultado.
- O endpoint deve retornar todos e somente os produtos que pertençam ao vendedor informado e tenham `isActive` igual a `true`.
- Produtos de outros vendedores e produtos inativos do vendedor informado não devem ser retornados.
- Quando o vendedor não tiver produtos ativos, a resposta deve ser HTTP `200` com uma lista vazia.
- A ausência de produtos não deve produzir resposta `404`.
- Cada item da lista deve seguir o contrato público de produto desta especificação.
- A consulta deve ser pública por meio da marcação `@Public()` e não deve exigir token JWT.

### RF-03 — Consulta de produto por ID

- Deve existir o endpoint `GET /products/:id`.
- O parâmetro `id` representa o UUID do produto consultado.
- Quando o produto existir, o endpoint deve retornar seus dados atuais conforme o contrato público de produto desta especificação.
- A consulta por ID não deve adicionar filtro por vendedor nem por `isActive`; um produto existente deve ser retornado independentemente de estar ativo ou inativo.
- Quando nenhum produto corresponder ao ID informado, o endpoint deve retornar HTTP `404` com indicação clara de que o produto não foi encontrado.
- A consulta deve ser pública por meio da marcação `@Public()` e não deve exigir token JWT.

### RF-04 — Ordem e resolução das rotas

- A rota com prefixo `seller/:sellerId` deve ser declarada antes da rota dinâmica `:id`.
- A rota raiz de listagem e a rota com prefixo de vendedor não podem ser capturadas pela rota dinâmica de consulta por ID.
- Uma chamada a `/products/seller/:sellerId` deve sempre executar a consulta de produtos do vendedor.
- O segmento `seller` nunca deve ser interpretado como o ID de um produto.

### RF-05 — Acesso público e preservação da criação protegida

- Os três endpoints de consulta definidos nesta especificação devem ser públicos e acessíveis sem cabeçalho de autorização.
- A presença de um token ausente, inválido ou expirado não deve impedir o acesso às consultas públicas.
- O `JwtAuthGuard` global existente deve continuar protegendo por padrão as demais rotas que não tenham marcação pública.
- O endpoint `POST /products` não deve receber `@Public()` e deve continuar exigindo autenticação JWT e role `seller` conforme seu contrato atual.
- Esta especificação não deve alterar a autenticação JWT, o guard global, a regra de criação de produtos ou o comportamento de outras rotas.

## Respostas esperadas

### 200 — Consulta realizada

- `GET /products` retorna uma lista de produtos ativos ordenada do mais recente para o mais antigo, inclusive uma lista vazia quando aplicável.
- `GET /products/seller/:sellerId` retorna uma lista de produtos ativos do vendedor informado, inclusive uma lista vazia quando aplicável.
- `GET /products/:id` retorna um único produto quando o registro existe.

### 404 — Produto não encontrado

- Aplica-se somente a `GET /products/:id` quando não existe produto com o UUID solicitado.
- A resposta deve indicar claramente que o produto não foi encontrado.
- As duas listagens nunca devem responder com `404` por ausência de resultados.

## Critérios de aceite

1. Existem exatamente três novos endpoints de consulta: `GET /products`, `GET /products/seller/:sellerId` e `GET /products/:id`.
2. Os três endpoints de consulta possuem marcação `@Public()` e respondem sem exigir token JWT.
3. `GET /products` retorna HTTP `200` com todos e somente os produtos ativos.
4. `GET /products` ordena os resultados por `createdAt` em ordem decrescente.
5. `GET /products` retorna HTTP `200` com uma lista vazia quando não há produtos ativos.
6. `GET /products/seller/:sellerId` retorna HTTP `200` com todos e somente os produtos ativos cujo `sellerId` corresponde ao parâmetro informado.
7. `GET /products/seller/:sellerId` não retorna produtos inativos nem produtos pertencentes a outro vendedor.
8. `GET /products/seller/:sellerId` retorna HTTP `200` com uma lista vazia quando não há produtos ativos para o vendedor, sem produzir `404`.
9. `GET /products/:id` retorna HTTP `200` e os dados atuais do produto quando o UUID corresponde a um registro existente.
10. `GET /products/:id` pode retornar um produto existente ativo ou inativo.
11. `GET /products/:id` retorna HTTP `404` com indicação clara de produto não encontrado quando o UUID não corresponde a nenhum registro.
12. A rota `seller/:sellerId` é declarada antes de `:id`, e o segmento `seller` não é interpretado como ID de produto.
13. Todos os produtos retornados contêm `id`, `name`, `description`, `price`, `stock`, `sellerId`, `isActive`, `createdAt` e `updatedAt`.
14. O endpoint existente `POST /products` permanece protegido pelo JWT global, sem marcação `@Public()`, e continua restrito a sellers.
15. A autenticação JWT global e os contratos existentes do `products-service` permanecem inalterados.
16. Não são adicionados update, delete, paginação, filtros adicionais, busca por texto ou endpoints fora do escopo.
17. Os testes existentes de scaffold, autenticação e criação de produto continuam passando após a implementação.
