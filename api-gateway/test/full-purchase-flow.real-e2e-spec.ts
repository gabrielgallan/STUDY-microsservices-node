import path from 'node:path'
import {
	assertPortIsFree,
	delay,
	type RunningService,
	requestJson,
	startService,
	stopService,
	waitForService,
	withDatabase,
} from './support/real-service-harness'

const USERS_PORT = 3021
const PRODUCTS_PORT = 3022
const CHECKOUT_PORT = 3023
const PAYMENTS_PORT = 3024
const GATEWAY_PORT = 3025
/** The port a locally started payments-service would use. */
const DEFAULT_PAYMENTS_PORT = 3004

const JWT_SECRET = 'gateway-full-flow-real-e2e-secret'
const RABBITMQ_URL = 'amqp://admin:admin@localhost:5672'

const USERS_URL = `http://127.0.0.1:${USERS_PORT}`
const PRODUCTS_URL = `http://127.0.0.1:${PRODUCTS_PORT}`
const CHECKOUT_URL = `http://127.0.0.1:${CHECKOUT_PORT}`
const PAYMENTS_URL = `http://127.0.0.1:${PAYMENTS_PORT}`
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`

const workspaceRoot = path.resolve(__dirname, '..', '..')
const serviceRoot = (name: string) => path.join(workspaceRoot, name)
const entryPoint = (name: string) =>
	path.join(workspaceRoot, name, 'dist', 'src', 'main.js')

const APPROVED_PRICE = 49.9
const APPROVED_QUANTITY = 2
const APPROVED_TOTAL = 99.8
/** The outcome follows the order total, not the unit price: 49.99 x 1 = 49.99. */
const REJECTED_PRICE = 49.99
const REJECTED_QUANTITY = 1
const REJECTED_TOTAL = 49.99
const CARD_DECLINED_REASON = 'Cartão recusado pela operadora'

interface OrderResponse {
	id: string
	cartId: string
	total: number
	status: string
}

interface PaymentResponse {
	orderId: string
	amount: number
	status: string
	transactionId: string | null
	rejectionReason: string | null
}

describe('full purchase journey through the real api-gateway', () => {
	jest.setTimeout(240_000)

	let usersService: RunningService | undefined
	let productsService: RunningService | undefined
	let checkoutService: RunningService | undefined
	let paymentsService: RunningService | undefined
	let gateway: RunningService | undefined

	const registeredEmails: string[] = []
	const createdProductIds: string[] = []
	const createdOrderIds: string[] = []
	const buyerIds: string[] = []
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	const registerAndLogin = async (role: 'seller' | 'buyer', sequence: number) => {
		const email = `gateway-full-flow-${role}-${sequence}-${runId}@example.invalid`
		const password = 'password123'

		const registration = await requestJson<{ id: string }>(
			`${GATEWAY_URL}/auth/register`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					password,
					firstName: 'Gateway',
					lastName: role === 'seller' ? 'Seller' : 'Buyer',
					role,
				}),
			},
		)

		expect(registration.status).toBe(201)
		registeredEmails.push(email)

		const login = await requestJson<{ token: string }>(`${GATEWAY_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password }),
		})

		expect(login.status).toBe(200)

		return {
			id: registration.body.id,
			authorization: `Bearer ${login.body.token}`,
		}
	}

	const createProduct = async (authorization: string, price: number) => {
		const response = await requestJson<{ id: string; price: number }>(
			`${GATEWAY_URL}/products`,
			{
				method: 'POST',
				headers: { Authorization: authorization, 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: `Full flow product ${price} ${runId}`,
					description: 'Product created by the full purchase flow suite',
					price,
					stock: 20,
				}),
			},
		)

		expect(response.status).toBe(201)
		createdProductIds.push(response.body.id)

		return response.body.id
	}

	/**
	 * The payment is produced asynchronously: the order message still has to
	 * travel through RabbitMQ and the simulated gateway sleeps up to 2s, so the
	 * payment is missing (404) and then pending before reaching its outcome.
	 */
	const waitForProcessedPayment = async (
		authorization: string,
		orderId: string,
		timeoutMilliseconds = 60_000,
	): Promise<PaymentResponse> => {
		const deadline = Date.now() + timeoutMilliseconds
		let lastSeen = 'no response yet'

		while (Date.now() < deadline) {
			const response = await requestJson<PaymentResponse>(
				`${GATEWAY_URL}/payments/${orderId}`,
				{ headers: { Authorization: authorization } },
			)

			if (response.status === 200 && response.body.status !== 'pending') {
				return response.body
			}

			lastSeen = `status ${response.status}, body ${JSON.stringify(response.body)}`
			await delay(500)
		}

		throw new Error(
			`Timed out waiting for the payment of order ${orderId} (last seen: ${lastSeen}).\n` +
				`Payments output:\n${paymentsService?.getOutput() ?? ''}`,
		)
	}

	const buyAndCheckout = async (
		buyerAuthorization: string,
		productId: string,
		quantity: number,
		expectedTotal: number,
	): Promise<OrderResponse> => {
		const cart = await requestJson<{ id: string; total: number; items: unknown[] }>(
			`${GATEWAY_URL}/cart/items`,
			{
				method: 'POST',
				headers: {
					Authorization: buyerAuthorization,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ productId, quantity }),
			},
		)

		if (cart.status !== 201) {
			throw new Error(
				`Adding to the cart failed with ${cart.status}: ${JSON.stringify(cart.body)}\n` +
					`Checkout output:\n${checkoutService?.getOutput() ?? ''}`,
			)
		}
		expect(cart.body.total).toBe(expectedTotal)

		const viewedCart = await requestJson<{ id: string; total: number }>(
			`${GATEWAY_URL}/cart`,
			{ headers: { Authorization: buyerAuthorization } },
		)
		expect(viewedCart.status).toBe(200)
		expect(viewedCart.body).toMatchObject({ id: cart.body.id, total: expectedTotal })

		const order = await requestJson<OrderResponse>(`${GATEWAY_URL}/cart/checkout`, {
			method: 'POST',
			headers: {
				Authorization: buyerAuthorization,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ paymentMethod: 'credit_card' }),
		})

		expect(order.status).toBe(201)
		expect(order.body).toMatchObject({
			cartId: cart.body.id,
			total: expectedTotal,
			status: 'pending',
		})
		createdOrderIds.push(order.body.id)

		return order.body
	}

	beforeAll(async () => {
		await Promise.all([
			assertPortIsFree(USERS_PORT),
			assertPortIsFree(PRODUCTS_PORT),
			assertPortIsFree(CHECKOUT_PORT),
			assertPortIsFree(PAYMENTS_PORT),
			assertPortIsFree(GATEWAY_PORT),
			assertPortIsFree(
				DEFAULT_PAYMENTS_PORT,
				`Port ${DEFAULT_PAYMENTS_PORT} is in use, which suggests a payments-service is already running. ` +
					'It would consume from the same payment_queue and steal the messages this suite waits for. ' +
					'Stop it before running the full purchase flow suite.',
			),
		])

		usersService = startService(
			serviceRoot('users-service'),
			entryPoint('users-service'),
			{
				NODE_ENV: 'test',
				PORT: String(USERS_PORT),
				JWT_SECRET,
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5435/users',
			},
		)
		await waitForService(`${USERS_URL}/health`, usersService)

		productsService = startService(
			serviceRoot('products-service'),
			entryPoint('products-service'),
			{
				NODE_ENV: 'test',
				PORT: String(PRODUCTS_PORT),
				JWT_SECRET,
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5436/products',
			},
		)
		await waitForService(`${PRODUCTS_URL}/health`, productsService)

		checkoutService = startService(
			serviceRoot('checkout-service'),
			entryPoint('checkout-service'),
			{
				NODE_ENV: 'test',
				PORT: String(CHECKOUT_PORT),
				JWT_SECRET,
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5433/checkout',
				USERS_SERVICE_URL: USERS_URL,
				PRODUCTS_SERVICE_URL: PRODUCTS_URL,
				RABBITMQ_URL,
			},
		)
		await waitForService(`${CHECKOUT_URL}/health`, checkoutService)

		paymentsService = startService(
			serviceRoot('payments-service'),
			entryPoint('payments-service'),
			{
				NODE_ENV: 'test',
				PORT: String(PAYMENTS_PORT),
				JWT_SECRET,
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5434/payments',
				RABBITMQ_URL,
				PAYMENT_GATEWAY_URL: 'http://127.0.0.1:65530',
				PAYMENT_GATEWAY_API_KEY: 'full-flow-e2e-key',
			},
		)
		await waitForService(`${PAYMENTS_URL}/health`, paymentsService)

		gateway = startService(serviceRoot('api-gateway'), entryPoint('api-gateway'), {
			NODE_ENV: 'test',
			PORT: String(GATEWAY_PORT),
			JWT_SECRET,
			USERS_SERVICE_URL: USERS_URL,
			PRODUCTS_SERVICE_URL: PRODUCTS_URL,
			CHECKOUT_SERVICE_URL: CHECKOUT_URL,
			PAYMENTS_SERVICE_URL: PAYMENTS_URL,
			CORS_ORIGINS: '*',
			RATE_LIMIT_SHORT: '2000',
			RATE_LIMIT_MEDIUM: '2000',
			RATE_LIMIT_LONG: '2000',
		})
		await waitForService(`${GATEWAY_URL}/health`, gateway)
	})

	afterAll(async () => {
		if (createdOrderIds.length > 0) {
			await withDatabase(5434, 'payments', async (database) => {
				await database.query('DELETE FROM payments WHERE "orderId" = ANY($1)', [
					createdOrderIds,
				])
			})
		}

		if (buyerIds.length > 0) {
			await withDatabase(5433, 'checkout', async (database) => {
				await database.query('DELETE FROM orders WHERE "userId" = ANY($1)', [buyerIds])
				await database.query('DELETE FROM carts WHERE "userId" = ANY($1)', [buyerIds])
			})
		}

		if (createdProductIds.length > 0) {
			await withDatabase(5436, 'products', async (database) => {
				await database.query('DELETE FROM products WHERE id = ANY($1)', [
					createdProductIds,
				])
			})
		}

		if (registeredEmails.length > 0) {
			await withDatabase(5435, 'users', async (database) => {
				await database.query('DELETE FROM users WHERE email = ANY($1)', [
					registeredEmails,
				])
			})
		}

		await stopService(gateway)
		await stopService(paymentsService)
		await stopService(checkoutService)
		await stopService(productsService)
		await stopService(usersService)
	})

	it('carries a purchase from catalog to an approved payment', async () => {
		const seller = await registerAndLogin('seller', 1)
		const approvedProductId = await createProduct(seller.authorization, APPROVED_PRICE)
		const rejectedProductId = await createProduct(seller.authorization, REJECTED_PRICE)

		const buyer = await registerAndLogin('buyer', 2)
		buyerIds.push(buyer.id)

		const catalog = await requestJson<Array<{ id: string }>>(
			`${GATEWAY_URL}/products`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(catalog.status).toBe(200)
		const catalogIds = catalog.body.map((product) => product.id)
		expect(catalogIds).toEqual(expect.arrayContaining([approvedProductId]))
		expect(catalogIds).toEqual(expect.arrayContaining([rejectedProductId]))

		const order = await buyAndCheckout(
			buyer.authorization,
			approvedProductId,
			APPROVED_QUANTITY,
			APPROVED_TOTAL,
		)

		const storedOrder = await requestJson<OrderResponse>(
			`${GATEWAY_URL}/orders/${order.id}`,
			{ headers: { Authorization: buyer.authorization } },
		)
		expect(storedOrder.status).toBe(200)
		expect(storedOrder.body).toMatchObject({
			id: order.id,
			total: APPROVED_TOTAL,
			status: 'pending',
		})

		const payment = await waitForProcessedPayment(buyer.authorization, order.id)

		expect(payment).toMatchObject({
			orderId: order.id,
			amount: APPROVED_TOTAL,
			status: 'approved',
			rejectionReason: null,
		})
		expect(payment.transactionId).toEqual(expect.any(String))
	})

	it('carries a purchase to a rejected payment on a .99 total', async () => {
		const seller = await registerAndLogin('seller', 3)
		const rejectedProductId = await createProduct(seller.authorization, REJECTED_PRICE)

		const buyer = await registerAndLogin('buyer', 4)
		buyerIds.push(buyer.id)

		const order = await buyAndCheckout(
			buyer.authorization,
			rejectedProductId,
			REJECTED_QUANTITY,
			REJECTED_TOTAL,
		)

		const payment = await waitForProcessedPayment(buyer.authorization, order.id)

		expect(payment).toMatchObject({
			orderId: order.id,
			amount: REJECTED_TOTAL,
			status: 'rejected',
			rejectionReason: CARD_DECLINED_REASON,
		})
		expect(payment.transactionId).toEqual(expect.any(String))
	})

	it('keeps payments behind authentication at the gateway', async () => {
		const anonymous = await requestJson(`${GATEWAY_URL}/payments/${createdOrderIds[0]}`)

		expect(anonymous.status).toBe(401)
	})

	it('answers 404 for an order without payment', async () => {
		const buyer = await registerAndLogin('buyer', 5)

		const response = await requestJson(
			`${GATEWAY_URL}/payments/f2b9a5a1-0c3d-4f1e-8a2b-6d7c8e9f0a1b`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(response.status).toBe(404)
	})
})
