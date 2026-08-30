import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import request from 'supertest'
import { In, type Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'
import {
	ProductNotFoundError,
	ProductsServiceUnavailableError,
} from '../src/cart/clients/products-client.errors'
import {
	type ExternalProduct,
	ProductsClientService,
} from '../src/cart/clients/products-client.service'
import { CartItem } from '../src/cart/entities/cart-item.entity'
import { Cart } from '../src/cart/entities/cart.entity'
import { configureSwagger } from '../src/config/swagger.config'
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'

describe('Cart management (e2e)', () => {
	let app: INestApplication
	let jwtService: JwtService
	let cartRepository: Repository<Cart>
	let cartItemRepository: Repository<CartItem>
	const getProduct = jest.fn()
	const userIds = new Set<string>()

	const buildProduct = (
		overrides: Partial<ExternalProduct> = {},
	): ExternalProduct => ({
		id: randomUUID(),
		name: 'Teclado mecânico',
		price: 199.9,
		stock: 10,
		isActive: true,
		sellerId: randomUUID(),
		...overrides,
	})

	const createUser = (role: UserRole = UserRole.BUYER) => {
		const id = randomUUID()
		userIds.add(id)

		return {
			id,
			token: jwtService.sign({ sub: id, email: `${id}@example.invalid`, role }),
		}
	}

	const addItem = (token: string, body: Record<string, unknown>) =>
		request(app.getHttpServer())
			.post('/cart/items')
			.set('Authorization', `Bearer ${token}`)
			.send(body)

	const getCart = (token: string) =>
		request(app.getHttpServer())
			.get('/cart')
			.set('Authorization', `Bearer ${token}`)

	const removeItem = (token: string, itemId: string) =>
		request(app.getHttpServer())
			.delete(`/cart/items/${itemId}`)
			.set('Authorization', `Bearer ${token}`)

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(RabbitmqService)
			.useValue({
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
				publishMessage: jest.fn(),
			})
			.overrideProvider(ProductsClientService)
			.useValue({ getProduct })
			.compile()

		app = testingModule.createNestApplication()
		configureSwagger(app)
		await app.init()

		jwtService = app.get(JwtService)
		cartRepository = app.get(getRepositoryToken(Cart))
		cartItemRepository = app.get(getRepositoryToken(CartItem))
	})

	afterAll(async () => {
		if (userIds.size > 0) {
			await cartRepository.delete({ userId: In([...userIds]) })
		}
		await app.close()
	})

	beforeEach(() => {
		getProduct.mockReset()
	})

	describe('authentication', () => {
		it('protects every cart route', async () => {
			await request(app.getHttpServer()).get('/cart').expect(401)
			await request(app.getHttpServer()).post('/cart/items').expect(401)
			await request(app.getHttpServer())
				.delete(`/cart/items/${randomUUID()}`)
				.expect(401)
		})

		it('rejects an invalid token', async () => {
			await request(app.getHttpServer())
				.get('/cart')
				.set('Authorization', 'Bearer invalid-token')
				.expect(401)
		})
	})

	describe('POST /cart/items input validation', () => {
		it.each([
			{ productId: 'not-a-uuid', quantity: 1 },
			{ productId: randomUUID(), quantity: 0 },
			{ productId: randomUUID(), quantity: -1 },
			{ productId: randomUUID(), quantity: 1.5 },
			{ productId: randomUUID(), quantity: '1' },
			{ productId: randomUUID() },
			{ quantity: 1 },
			{ productId: randomUUID(), quantity: 1, price: 10 },
		])('answers 400 for %o', async (body) => {
			const user = createUser()

			await addItem(user.token, body).expect(400)
		})

		it('does not reach the products-service nor write anything', async () => {
			const user = createUser()

			await addItem(user.token, { productId: 'not-a-uuid', quantity: 1 }).expect(400)

			expect(getProduct).not.toHaveBeenCalled()
			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(0)
		})
	})

	describe('POST /cart/items product rules', () => {
		it('answers 404 when the product does not exist', async () => {
			const user = createUser()
			const productId = randomUUID()
			getProduct.mockRejectedValue(new ProductNotFoundError(productId))

			await addItem(user.token, { productId, quantity: 1 }).expect(404)

			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(0)
		})

		it('answers 422 for an inactive product without creating a cart', async () => {
			const user = createUser()
			const product = buildProduct({ isActive: false })
			getProduct.mockResolvedValue(product)

			await addItem(user.token, { productId: product.id, quantity: 1 }).expect(422)

			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(0)
		})

		it('answers 503 when the products-service is unavailable', async () => {
			const user = createUser()
			getProduct.mockRejectedValue(new ProductsServiceUnavailableError())

			await addItem(user.token, { productId: randomUUID(), quantity: 1 }).expect(503)

			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(0)
		})
	})

	describe('POST /cart/items success', () => {
		it('creates the active cart and snapshots the product', async () => {
			const user = createUser()
			const product = buildProduct()
			getProduct.mockResolvedValue(product)

			const response = await addItem(user.token, {
				productId: product.id,
				quantity: 3,
			}).expect(201)

			expect(response.body).toMatchObject({
				userId: user.id,
				status: 'active',
				total: 599.7,
			})
			expect(response.body.id).toEqual(expect.any(String))
			expect(response.body.items).toHaveLength(1)
			expect(response.body.items[0]).toMatchObject({
				productId: product.id,
				productName: product.name,
				price: 199.9,
				quantity: 3,
				subtotal: 599.7,
			})

			const carts = await cartRepository.find({ where: { userId: user.id } })
			expect(carts).toHaveLength(1)
			expect(carts[0].status).toBe('active')
		})

		it('sums the quantity of a product already in the cart', async () => {
			const user = createUser()
			const product = buildProduct({ price: 50 })
			getProduct.mockResolvedValue(product)

			await addItem(user.token, { productId: product.id, quantity: 2 }).expect(201)
			const response = await addItem(user.token, {
				productId: product.id,
				quantity: 3,
			}).expect(201)

			expect(response.body.items).toHaveLength(1)
			expect(response.body.items[0]).toMatchObject({ quantity: 5, subtotal: 250 })
			expect(response.body.total).toBe(250)

			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(1)
		})

		it('keeps the original snapshot when the product changes afterwards', async () => {
			const user = createUser()
			const product = buildProduct({ name: 'Nome original', price: 100 })
			getProduct.mockResolvedValue(product)

			await addItem(user.token, { productId: product.id, quantity: 1 }).expect(201)

			getProduct.mockResolvedValue({
				...product,
				name: 'Nome alterado',
				price: 999.99,
			})
			const response = await addItem(user.token, {
				productId: product.id,
				quantity: 1,
			}).expect(201)

			expect(response.body.items[0]).toMatchObject({
				productName: 'Nome original',
				price: 100,
				quantity: 2,
				subtotal: 200,
			})
		})

		it('keeps distinct products as separate items of a single cart', async () => {
			const user = createUser()
			const first = buildProduct({ price: 10.55 })
			const second = buildProduct({ price: 4.45 })

			getProduct.mockResolvedValue(first)
			await addItem(user.token, { productId: first.id, quantity: 2 }).expect(201)

			getProduct.mockResolvedValue(second)
			const response = await addItem(user.token, {
				productId: second.id,
				quantity: 1,
			}).expect(201)

			expect(response.body.items).toHaveLength(2)
			expect(response.body.total).toBe(25.55)
			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(1)
		})

		it('exposes money as numbers and hides persistence details', async () => {
			const user = createUser()
			const product = buildProduct()
			getProduct.mockResolvedValue(product)

			const response = await addItem(user.token, {
				productId: product.id,
				quantity: 1,
			}).expect(201)

			expect(typeof response.body.total).toBe('number')
			expect(typeof response.body.items[0].price).toBe('number')
			expect(typeof response.body.items[0].subtotal).toBe('number')
			expect(Object.keys(response.body.items[0]).sort()).toEqual([
				'id',
				'price',
				'productId',
				'productName',
				'quantity',
				'subtotal',
			])
			expect(response.body.items[0]).not.toHaveProperty('cartId')
			expect(response.body.items[0]).not.toHaveProperty('cart')
		})
	})

	describe('GET /cart', () => {
		it('returns the active cart with its items and total', async () => {
			const user = createUser()
			const product = buildProduct({ price: 20 })
			getProduct.mockResolvedValue(product)
			await addItem(user.token, { productId: product.id, quantity: 4 }).expect(201)

			const response = await getCart(user.token).expect(200)

			expect(response.body).toMatchObject({ userId: user.id, total: 80 })
			expect(response.body.items).toHaveLength(1)
		})

		it('returns an empty cart without persisting anything', async () => {
			const user = createUser()

			const response = await getCart(user.token).expect(200)

			expect(response.body).toEqual({
				id: null,
				userId: user.id,
				status: 'active',
				items: [],
				total: 0,
				createdAt: null,
				updatedAt: null,
			})
			await expect(
				cartRepository.count({ where: { userId: user.id } }),
			).resolves.toBe(0)
		})

		it('never calls the products-service', async () => {
			const user = createUser()

			await getCart(user.token).expect(200)

			expect(getProduct).not.toHaveBeenCalled()
		})
	})

	describe('DELETE /cart/items/:itemId', () => {
		it('answers 400 for an itemId that is not a UUID', async () => {
			const user = createUser()

			await removeItem(user.token, 'not-a-uuid').expect(400)
		})

		it('answers 404 for an unknown item', async () => {
			const user = createUser()

			await removeItem(user.token, randomUUID()).expect(404)
		})

		it('removes only the given item and recalculates the total', async () => {
			const user = createUser()
			const first = buildProduct({ price: 30 })
			const second = buildProduct({ price: 12.5 })

			getProduct.mockResolvedValue(first)
			await addItem(user.token, { productId: first.id, quantity: 1 }).expect(201)
			getProduct.mockResolvedValue(second)
			const cart = await addItem(user.token, {
				productId: second.id,
				quantity: 2,
			}).expect(201)

			const removedItem = cart.body.items.find(
				(item: { productId: string }) => item.productId === first.id,
			)
			const response = await removeItem(user.token, removedItem.id).expect(200)

			expect(response.body.items).toHaveLength(1)
			expect(response.body.items[0].productId).toBe(second.id)
			expect(response.body.total).toBe(25)
		})

		it('keeps the cart active and zeroed after removing the last item', async () => {
			const user = createUser()
			const product = buildProduct()
			getProduct.mockResolvedValue(product)
			const cart = await addItem(user.token, {
				productId: product.id,
				quantity: 1,
			}).expect(201)

			const response = await removeItem(
				user.token,
				cart.body.items[0].id,
			).expect(200)

			expect(response.body).toMatchObject({
				id: cart.body.id,
				status: 'active',
				items: [],
				total: 0,
			})
		})

		it('answers 404 without removing an item owned by another user', async () => {
			const owner = createUser()
			const intruder = createUser()
			const product = buildProduct()
			getProduct.mockResolvedValue(product)
			const cart = await addItem(owner.token, {
				productId: product.id,
				quantity: 1,
			}).expect(201)
			const itemId = cart.body.items[0].id

			await removeItem(intruder.token, itemId).expect(404)

			await expect(cartItemRepository.countBy({ id: itemId })).resolves.toBe(1)
		})
	})

	describe('ownership', () => {
		it('keeps carts of different users isolated', async () => {
			const first = createUser()
			const second = createUser()
			const firstProduct = buildProduct({ price: 10 })
			const secondProduct = buildProduct({ price: 70 })

			getProduct.mockResolvedValue(firstProduct)
			await addItem(first.token, { productId: firstProduct.id, quantity: 1 })
			getProduct.mockResolvedValue(secondProduct)
			await addItem(second.token, { productId: secondProduct.id, quantity: 1 })

			const firstCart = await getCart(first.token).expect(200)
			const secondCart = await getCart(second.token).expect(200)

			expect(firstCart.body.userId).toBe(first.id)
			expect(firstCart.body.total).toBe(10)
			expect(firstCart.body.items).toHaveLength(1)
			expect(firstCart.body.items[0].productId).toBe(firstProduct.id)
			expect(secondCart.body.id).not.toBe(firstCart.body.id)
			expect(secondCart.body.total).toBe(70)
		})

		it('ignores any userId or cartId sent by the client', async () => {
			const user = createUser()
			const other = createUser()
			const product = buildProduct({ price: 15 })
			getProduct.mockResolvedValue(product)

			await addItem(user.token, {
				productId: product.id,
				quantity: 1,
				userId: other.id,
			}).expect(400)

			const response = await request(app.getHttpServer())
				.get('/cart')
				.query({ userId: other.id })
				.set('Authorization', `Bearer ${user.token}`)
				.expect(200)

			expect(response.body.userId).toBe(user.id)
		})

		it('behaves the same for sellers and buyers', async () => {
			const seller = createUser(UserRole.SELLER)
			const product = buildProduct({ price: 25 })
			getProduct.mockResolvedValue(product)

			const created = await addItem(seller.token, {
				productId: product.id,
				quantity: 2,
			}).expect(201)

			expect(created.body).toMatchObject({ userId: seller.id, total: 50 })

			await removeItem(seller.token, created.body.items[0].id).expect(200)
			const response = await getCart(seller.token).expect(200)

			expect(response.body.items).toHaveLength(0)
			expect(response.body.total).toBe(0)
		})
	})

	describe('documentation', () => {
		it('documents the cart routes as authenticated operations', async () => {
			const response = await request(app.getHttpServer()).get('/api-json').expect(200)

			expect(response.body.paths['/cart'].get.tags).toContain('Cart')
			expect(response.body.paths['/cart'].get.security).toContainEqual({ bearer: [] })
			expect(response.body.paths['/cart/items']).toHaveProperty('post')
			expect(response.body.paths['/cart/items/{itemId}']).toHaveProperty('delete')
		})
	})
})
