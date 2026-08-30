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
	type ExternalProduct,
	ProductsClientService,
} from '../src/cart/clients/products-client.service'
import { CartItem } from '../src/cart/entities/cart-item.entity'
import { Cart, CartStatus } from '../src/cart/entities/cart.entity'
import { configureSwagger } from '../src/config/swagger.config'
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'
import { Order, OrderStatus } from '../src/orders/entities/order.entity'

describe('Order checkout (e2e)', () => {
	let app: INestApplication
	let jwtService: JwtService
	let cartRepository: Repository<Cart>
	let cartItemRepository: Repository<CartItem>
	let orderRepository: Repository<Order>
	const getProduct = jest.fn()
	const publishMessage = jest.fn()
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

	const checkout = (token: string, body: Record<string, unknown>) =>
		request(app.getHttpServer())
			.post('/cart/checkout')
			.set('Authorization', `Bearer ${token}`)
			.send(body)

	const listOrders = (token: string) =>
		request(app.getHttpServer())
			.get('/orders')
			.set('Authorization', `Bearer ${token}`)

	const getOrder = (token: string, id: string) =>
		request(app.getHttpServer())
			.get(`/orders/${id}`)
			.set('Authorization', `Bearer ${token}`)

	/** Builds a populated active cart through the real cart endpoints. */
	const seedCart = async (
		token: string,
		product = buildProduct(),
		quantity = 2,
	) => {
		getProduct.mockResolvedValue(product)
		const response = await addItem(token, {
			productId: product.id,
			quantity,
		}).expect(201)

		return { product, cart: response.body }
	}

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(RabbitmqService)
			.useValue({
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
				publishMessage,
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
		orderRepository = app.get(getRepositoryToken(Order))
	})

	afterAll(async () => {
		if (userIds.size > 0) {
			const ids = [...userIds]
			await orderRepository.delete({ userId: In(ids) })
			await cartRepository.delete({ userId: In(ids) })
		}
		await app.close()
	})

	beforeEach(() => {
		getProduct.mockReset()
		publishMessage.mockReset()
		publishMessage.mockResolvedValue(undefined)
	})

	describe('authentication', () => {
		it('protects checkout and order routes', async () => {
			await request(app.getHttpServer()).post('/cart/checkout').expect(401)
			await request(app.getHttpServer()).get('/orders').expect(401)
			await request(app.getHttpServer())
				.get(`/orders/${randomUUID()}`)
				.expect(401)
		})

		it('rejects an invalid token', async () => {
			await request(app.getHttpServer())
				.post('/cart/checkout')
				.set('Authorization', 'Bearer invalid-token')
				.send({ paymentMethod: 'pix' })
				.expect(401)
		})
	})

	describe('POST /cart/checkout input validation', () => {
		it.each([
			{},
			{ paymentMethod: '' },
			{ paymentMethod: 'bitcoin' },
			{ paymentMethod: 42 },
			{ paymentMethod: 'pix', total: 1 },
			{ paymentMethod: 'pix', userId: randomUUID() },
			{ paymentMethod: 'pix', status: 'paid' },
		])('answers 400 for %o', async (body) => {
			const user = createUser()
			await seedCart(user.token)

			await checkout(user.token, body).expect(400)
		})

		it('keeps the cart untouched and publishes nothing', async () => {
			const user = createUser()
			const { cart } = await seedCart(user.token)

			await checkout(user.token, { paymentMethod: 'bitcoin' }).expect(400)

			await expect(
				orderRepository.countBy({ userId: user.id }),
			).resolves.toBe(0)
			const stored = await cartRepository.findOneByOrFail({ id: cart.id })
			expect(stored.status).toBe(CartStatus.ACTIVE)
			expect(publishMessage).not.toHaveBeenCalled()
		})

		it.each(['credit_card', 'debit_card', 'pix', 'boleto'])(
			'accepts %s as a payment method',
			async (paymentMethod) => {
				const user = createUser()
				await seedCart(user.token)

				const response = await checkout(user.token, { paymentMethod }).expect(201)

				expect(response.body.paymentMethod).toBe(paymentMethod)
			},
		)
	})

	describe('POST /cart/checkout business rules', () => {
		it('answers 422 when the user has no active cart', async () => {
			const user = createUser()

			await checkout(user.token, { paymentMethod: 'pix' }).expect(422)

			await expect(
				orderRepository.countBy({ userId: user.id }),
			).resolves.toBe(0)
			expect(publishMessage).not.toHaveBeenCalled()
		})

		it('answers 422 for an active cart without items', async () => {
			const user = createUser()
			const cart = await cartRepository.save(
				cartRepository.create({ userId: user.id }),
			)

			await checkout(user.token, { paymentMethod: 'pix' }).expect(422)

			const stored = await cartRepository.findOneByOrFail({ id: cart.id })
			expect(stored.status).toBe(CartStatus.ACTIVE)
			await expect(
				orderRepository.countBy({ userId: user.id }),
			).resolves.toBe(0)
			expect(publishMessage).not.toHaveBeenCalled()
		})

		it('answers 422 on a second checkout and keeps a single order', async () => {
			const user = createUser()
			await seedCart(user.token)

			await checkout(user.token, { paymentMethod: 'pix' }).expect(201)
			await checkout(user.token, { paymentMethod: 'pix' }).expect(422)

			await expect(
				orderRepository.countBy({ userId: user.id }),
			).resolves.toBe(1)
		})

		it('creates at most one order for concurrent checkouts', async () => {
			const user = createUser()
			await seedCart(user.token)

			const responses = await Promise.all([
				checkout(user.token, { paymentMethod: 'pix' }),
				checkout(user.token, { paymentMethod: 'pix' }),
			])

			expect(responses.map((response) => response.status).sort()).toEqual([
				201, 422,
			])
			await expect(
				orderRepository.countBy({ userId: user.id }),
			).resolves.toBe(1)
			expect(publishMessage).toHaveBeenCalledTimes(1)
		})
	})

	describe('POST /cart/checkout success', () => {
		it('creates a pending order snapshotting the cart total', async () => {
			const user = createUser()
			const { cart } = await seedCart(user.token, buildProduct({ price: 30.25 }), 2)

			const response = await checkout(user.token, {
				paymentMethod: 'credit_card',
			}).expect(201)

			expect(response.body).toMatchObject({
				userId: user.id,
				cartId: cart.id,
				total: 60.5,
				status: OrderStatus.PENDING,
				paymentMethod: 'credit_card',
			})
			expect(response.body.id).toEqual(expect.any(String))
			expect(typeof response.body.total).toBe('number')
			expect(response.body).not.toHaveProperty('items')
		})

		it('completes the cart while keeping its items', async () => {
			const user = createUser()
			const { cart } = await seedCart(user.token)

			await checkout(user.token, { paymentMethod: 'pix' }).expect(201)

			const stored = await cartRepository.findOneByOrFail({ id: cart.id })
			expect(stored.status).toBe(CartStatus.COMPLETED)
			await expect(cartItemRepository.countBy({ cartId: cart.id })).resolves.toBe(1)
		})

		it('leaves no active cart and starts a new one on the next add', async () => {
			const user = createUser()
			const { cart } = await seedCart(user.token)
			await checkout(user.token, { paymentMethod: 'pix' }).expect(201)

			const emptyCart = await request(app.getHttpServer())
				.get('/cart')
				.set('Authorization', `Bearer ${user.token}`)
				.expect(200)

			expect(emptyCart.body).toMatchObject({ id: null, items: [], total: 0 })

			const { cart: newCart } = await seedCart(user.token, buildProduct(), 1)
			expect(newCart.id).not.toBe(cart.id)
			expect(newCart.items).toHaveLength(1)
		})
	})

	describe('payment order publication', () => {
		it('publishes one message built from the order and the cart', async () => {
			const user = createUser()
			const product = buildProduct({ price: 12.5 })
			await seedCart(user.token, product, 4)

			const response = await checkout(user.token, {
				paymentMethod: 'boleto',
			}).expect(201)

			expect(publishMessage).toHaveBeenCalledTimes(1)
			const [exchange, routingKey, message] = publishMessage.mock.calls[0]

			expect(exchange).toBe('payments')
			expect(routingKey).toBe('payment.order')
			expect(message).toMatchObject({
				orderId: response.body.id,
				userId: user.id,
				amount: 50,
				paymentMethod: 'boleto',
				items: [{ productId: product.id, quantity: 4, price: 12.5 }],
				metadata: { service: 'checkout-service' },
			})
			expect(typeof message.amount).toBe('number')
			expect(typeof message.items[0].price).toBe('number')
			expect(new Date(message.createdAt).toISOString()).toBe(message.createdAt)
		})

		it('still answers 201 with a pending order when publishing fails', async () => {
			const user = createUser()
			await seedCart(user.token)
			publishMessage.mockRejectedValue(new Error('broker is down'))

			const response = await checkout(user.token, {
				paymentMethod: 'pix',
			}).expect(201)

			expect(response.body.status).toBe(OrderStatus.PENDING)
			expect(JSON.stringify(response.body)).not.toContain('broker is down')

			const stored = await orderRepository.findOneByOrFail({
				id: response.body.id,
			})
			expect(stored.status).toBe(OrderStatus.PENDING)
			const cart = await cartRepository.findOneByOrFail({ id: stored.cartId })
			expect(cart.status).toBe(CartStatus.COMPLETED)
		})
	})

	describe('GET /orders', () => {
		it('returns the user orders from the newest to the oldest', async () => {
			const user = createUser()
			const created: string[] = []

			for (const paymentMethod of ['pix', 'boleto', 'credit_card']) {
				await seedCart(user.token, buildProduct(), 1)
				const response = await checkout(user.token, { paymentMethod }).expect(201)
				created.push(response.body.id)
			}

			const response = await listOrders(user.token).expect(200)

			expect(response.body.map((order: { id: string }) => order.id)).toEqual(
				[...created].reverse(),
			)
			const dates = response.body.map((order: { createdAt: string }) =>
				new Date(order.createdAt).getTime(),
			)
			expect([...dates].sort((a: number, b: number) => b - a)).toEqual(dates)
		})

		it('returns an empty list for a user without orders', async () => {
			const user = createUser()

			await listOrders(user.token).expect(200, [])
		})

		it('never returns orders of another user', async () => {
			const owner = createUser()
			const other = createUser()
			await seedCart(owner.token)
			await checkout(owner.token, { paymentMethod: 'pix' }).expect(201)

			const response = await request(app.getHttpServer())
				.get('/orders')
				.query({ userId: owner.id })
				.set('Authorization', `Bearer ${other.token}`)
				.expect(200)

			expect(response.body).toEqual([])
		})
	})

	describe('GET /orders/:id', () => {
		it('answers 400 for an id that is not a UUID', async () => {
			const user = createUser()

			await getOrder(user.token, 'not-a-uuid').expect(400)
		})

		it('answers 404 for an unknown order', async () => {
			const user = createUser()

			await getOrder(user.token, randomUUID()).expect(404)
		})

		it('returns the order of the authenticated user', async () => {
			const user = createUser()
			const { cart } = await seedCart(user.token)
			const created = await checkout(user.token, {
				paymentMethod: 'debit_card',
			}).expect(201)

			const response = await getOrder(user.token, created.body.id).expect(200)

			expect(response.body).toMatchObject({
				id: created.body.id,
				userId: user.id,
				cartId: cart.id,
				status: OrderStatus.PENDING,
				paymentMethod: 'debit_card',
			})
			expect(typeof response.body.total).toBe('number')
		})

		it('answers 404 for an order owned by another user', async () => {
			const owner = createUser()
			const intruder = createUser()
			await seedCart(owner.token)
			const created = await checkout(owner.token, {
				paymentMethod: 'pix',
			}).expect(201)

			await getOrder(intruder.token, created.body.id).expect(404)
		})
	})

	describe('roles and documentation', () => {
		it('behaves the same for sellers and buyers', async () => {
			const seller = createUser(UserRole.SELLER)
			await seedCart(seller.token, buildProduct({ price: 10 }), 3)

			const created = await checkout(seller.token, {
				paymentMethod: 'pix',
			}).expect(201)

			expect(created.body).toMatchObject({ userId: seller.id, total: 30 })
			await getOrder(seller.token, created.body.id).expect(200)
			const orders = await listOrders(seller.token).expect(200)
			expect(orders.body).toHaveLength(1)
		})

		it('documents the checkout and order routes as authenticated', async () => {
			const response = await request(app.getHttpServer()).get('/api-json').expect(200)

			expect(response.body.paths['/cart/checkout'].post.security).toContainEqual({
				bearer: [],
			})
			expect(response.body.paths['/orders'].get.tags).toContain('Orders')
			expect(response.body.paths['/orders/{id}']).toHaveProperty('get')
		})
	})
})
