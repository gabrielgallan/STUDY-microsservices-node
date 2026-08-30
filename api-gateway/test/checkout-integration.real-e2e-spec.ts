import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { Client } from 'pg'

const USERS_PORT = 3011
const PRODUCTS_PORT = 3012
const CHECKOUT_PORT = 3013
const GATEWAY_PORT = 3015
const JWT_SECRET = 'gateway-checkout-real-e2e-secret'
const USERS_URL = `http://127.0.0.1:${USERS_PORT}`
const PRODUCTS_URL = `http://127.0.0.1:${PRODUCTS_PORT}`
const CHECKOUT_URL = `http://127.0.0.1:${CHECKOUT_PORT}`
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`
const workspaceRoot = path.resolve(__dirname, '..', '..')
const usersServiceRoot = path.join(workspaceRoot, 'users-service')
const productsServiceRoot = path.join(workspaceRoot, 'products-service')
const checkoutServiceRoot = path.join(workspaceRoot, 'checkout-service')
const gatewayRoot = path.join(workspaceRoot, 'api-gateway')

interface RunningService {
	process: ChildProcess
	getOutput: () => string
}

interface HttpResult<T> {
	status: number
	body: T
}

const delay = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

const assertPortIsFree = (port: number): Promise<void> =>
	new Promise((resolve, reject) => {
		const server = createServer()

		server.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') {
				reject(
					new Error(
						`Port ${port} is already in use; the real E2E suite never stops external processes.`,
					),
				)
				return
			}

			reject(error)
		})

		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve())
		})
	})

const startService = (
	serviceRoot: string,
	mainFile: string,
	environment: NodeJS.ProcessEnv,
): RunningService => {
	let output = ''
	const child = spawn(process.execPath, [mainFile], {
		cwd: serviceRoot,
		env: { ...process.env, ...environment },
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})
	const collectOutput = (chunk: Buffer) => {
		output = `${output}${chunk.toString()}`.slice(-20_000)
	}

	child.stdout?.on('data', collectOutput)
	child.stderr?.on('data', collectOutput)

	return {
		process: child,
		getOutput: () => output,
	}
}

const waitForService = async (
	url: string,
	service: RunningService,
	timeoutMilliseconds = 30_000,
): Promise<void> => {
	const deadline = Date.now() + timeoutMilliseconds

	while (Date.now() < deadline) {
		if (service.process.exitCode !== null) {
			throw new Error(`Service exited before becoming ready.\n${service.getOutput()}`)
		}

		try {
			const response = await fetch(url)

			if (response.ok) {
				return
			}
		} catch {
			// The process is still starting.
		}

		await delay(250)
	}

	throw new Error(`Timed out waiting for ${url}.\n${service.getOutput()}`)
}

const stopService = async (service: RunningService | undefined): Promise<void> => {
	if (!service || service.process.exitCode !== null) {
		return
	}

	const waitForExit = async (timeoutMilliseconds: number): Promise<boolean> => {
		if (service.process.exitCode !== null) {
			return true
		}

		return new Promise((resolve) => {
			const onExit = () => {
				clearTimeout(timer)
				resolve(true)
			}
			const timer = setTimeout(() => {
				service.process.off('exit', onExit)
				resolve(false)
			}, timeoutMilliseconds)

			service.process.once('exit', onExit)
		})
	}

	service.process.kill()

	const exited = await waitForExit(5_000)

	if (!exited) {
		service.process.kill('SIGKILL')
		await waitForExit(5_000)
	}
}

const withDatabase = async (
	port: number,
	database: string,
	run: (client: Client) => Promise<void>,
): Promise<void> => {
	const client = new Client({
		host: '127.0.0.1',
		port,
		user: 'docker',
		password: 'docker',
		database,
	})

	try {
		await client.connect()
		await run(client)
	} finally {
		await client.end().catch(() => undefined)
	}
}

describe('checkout flow through the real api-gateway', () => {
	jest.setTimeout(180_000)

	let usersService: RunningService | undefined
	let productsService: RunningService | undefined
	let checkoutService: RunningService | undefined
	let gateway: RunningService | undefined
	const registeredEmails: string[] = []
	let createdProductId: string | undefined
	let buyerId: string | undefined
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	const requestJson = async <T>(
		url: string,
		init?: RequestInit,
	): Promise<HttpResult<T>> => {
		const response = await fetch(url, init)
		const body = (await response.json()) as T

		return { status: response.status, body }
	}

	let accountSequence = 0

	const registerAndLogin = async (role: 'seller' | 'buyer') => {
		accountSequence += 1
		const email = `gateway-checkout-${role}-${accountSequence}-${runId}@example.invalid`
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

	beforeAll(async () => {
		await Promise.all([
			assertPortIsFree(USERS_PORT),
			assertPortIsFree(PRODUCTS_PORT),
			assertPortIsFree(CHECKOUT_PORT),
			assertPortIsFree(GATEWAY_PORT),
		])

		usersService = startService(
			usersServiceRoot,
			path.join(usersServiceRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(USERS_PORT),
				JWT_SECRET,
				DB_HOST: '127.0.0.1',
				DB_PORT: '5435',
				DB_USERNAME: 'docker',
				DB_PASSWORD: 'docker',
				DB_DATABASE: 'users',
			},
		)
		await waitForService(`${USERS_URL}/health`, usersService)

		productsService = startService(
			productsServiceRoot,
			path.join(productsServiceRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(PRODUCTS_PORT),
				JWT_SECRET,
				DB_HOST: '127.0.0.1',
				DB_PORT: '5436',
				DB_USERNAME: 'docker',
				DB_PASSWORD: 'docker',
				DB_DATABASE: 'products',
			},
		)
		await waitForService(`${PRODUCTS_URL}/health`, productsService)

		checkoutService = startService(
			checkoutServiceRoot,
			path.join(checkoutServiceRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(CHECKOUT_PORT),
				JWT_SECRET,
				DB_HOST: '127.0.0.1',
				DB_PORT: '5433',
				DB_USERNAME: 'docker',
				DB_PASSWORD: 'docker',
				DB_DATABASE: 'checkout',
				USERS_SERVICE_URL: USERS_URL,
				PRODUCTS_SERVICE_URL: PRODUCTS_URL,
				// No broker is required: publishing a payment order is best-effort.
				RABBITMQ_URL: 'amqp://guest:guest@127.0.0.1:65531',
			},
		)
		await waitForService(`${CHECKOUT_URL}/health`, checkoutService)

		gateway = startService(
			gatewayRoot,
			path.join(gatewayRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(GATEWAY_PORT),
				JWT_SECRET,
				USERS_SERVICE_URL: USERS_URL,
				PRODUCTS_SERVICE_URL: PRODUCTS_URL,
				CHECKOUT_SERVICE_URL: CHECKOUT_URL,
				PAYMENTS_SERVICE_URL: 'http://127.0.0.1:65533',
				CORS_ORIGINS: '*',
				// The flow issues more requests per second than the default limits allow.
				RATE_LIMIT_SHORT: '2000',
				RATE_LIMIT_MEDIUM: '2000',
				RATE_LIMIT_LONG: '2000',
			},
		)
		await waitForService(`${GATEWAY_URL}/health`, gateway)
	})

	afterAll(async () => {
		if (buyerId) {
			await withDatabase(5433, 'checkout', async (database) => {
				await database.query('DELETE FROM orders WHERE "userId" = $1', [buyerId])
				await database.query('DELETE FROM carts WHERE "userId" = $1', [buyerId])
			})
		}

		if (createdProductId) {
			await withDatabase(5436, 'products', async (database) => {
				await database.query('DELETE FROM products WHERE id = $1', [createdProductId])
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
		await stopService(checkoutService)
		await stopService(productsService)
		await stopService(usersService)
	})

	it('runs login, cart, checkout and orders entirely through the gateway', async () => {
		const seller = await registerAndLogin('seller')

		const productPayload = {
			name: `Gateway checkout product ${runId}`,
			description: 'Product created by the checkout gateway integration suite',
			price: 49.9,
			stock: 10,
		}
		const product = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/products`,
			{
				method: 'POST',
				headers: {
					Authorization: seller.authorization,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(productPayload),
			},
		)

		expect(product.status).toBe(201)
		createdProductId = product.body.id as string

		const buyer = await registerAndLogin('buyer')
		buyerId = buyer.id

		const addedItem = await requestJson<{
			id: string
			userId: string
			total: number
			items: { productId: string; quantity: number; subtotal: number }[]
		}>(`${GATEWAY_URL}/cart/items`, {
			method: 'POST',
			headers: {
				Authorization: buyer.authorization,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ productId: createdProductId, quantity: 2 }),
		})

		if (addedItem.status !== 201) {
			throw new Error(
				`Adding an item failed with ${addedItem.status}: ${JSON.stringify(addedItem.body)}\nCheckout output:\n${checkoutService?.getOutput() ?? ''}`,
			)
		}

		expect(addedItem.body).toMatchObject({ userId: buyer.id, total: 99.8 })
		expect(addedItem.body.items).toHaveLength(1)
		expect(addedItem.body.items[0]).toMatchObject({
			productId: createdProductId,
			quantity: 2,
			subtotal: 99.8,
		})

		const cart = await requestJson<{
			id: string
			total: number
			items: { productId: string }[]
		}>(`${GATEWAY_URL}/cart`, {
			headers: { Authorization: buyer.authorization },
		})

		expect(cart.status).toBe(200)
		expect(cart.body.id).toBe(addedItem.body.id)
		expect(cart.body.total).toBe(99.8)
		expect(cart.body.items).toHaveLength(1)
		expect(cart.body.items[0].productId).toBe(createdProductId)

		const order = await requestJson<{
			id: string
			userId: string
			cartId: string
			total: number
			status: string
			paymentMethod: string
		}>(`${GATEWAY_URL}/cart/checkout`, {
			method: 'POST',
			headers: {
				Authorization: buyer.authorization,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ paymentMethod: 'pix' }),
		})

		expect(order.status).toBe(201)
		expect(order.body).toMatchObject({
			userId: buyer.id,
			cartId: cart.body.id,
			total: cart.body.total,
			status: 'pending',
			paymentMethod: 'pix',
		})

		const orders = await requestJson<Array<{ id: string; total: number }>>(
			`${GATEWAY_URL}/orders`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(orders.status).toBe(200)
		expect(orders.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: order.body.id, total: cart.body.total }),
			]),
		)

		const orderDetail = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/orders/${order.body.id}`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(orderDetail.status).toBe(200)
		expect(orderDetail.body).toMatchObject({
			id: order.body.id,
			userId: buyer.id,
			total: cart.body.total,
			status: 'pending',
		})

		const emptyCart = await requestJson<{ id: string | null; total: number }>(
			`${GATEWAY_URL}/cart`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(emptyCart.status).toBe(200)
		expect(emptyCart.body).toMatchObject({ id: null, total: 0 })
	})

	it('rejects cart and order requests without a token', async () => {
		const anonymous = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/cart`,
		)

		expect(anonymous.status).toBe(401)

		const orders = await requestJson<Record<string, unknown>>(`${GATEWAY_URL}/orders`)

		expect(orders.status).toBe(401)
	})

	it('preserves checkout-service business errors through the gateway', async () => {
		const buyer = await registerAndLogin('buyer')

		const emptyCheckout = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/cart/checkout`,
			{
				method: 'POST',
				headers: {
					Authorization: buyer.authorization,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ paymentMethod: 'pix' }),
			},
		)

		expect(emptyCheckout.status).toBe(422)

		const invalidMethod = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/cart/checkout`,
			{
				method: 'POST',
				headers: {
					Authorization: buyer.authorization,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ paymentMethod: 'bitcoin' }),
			},
		)

		expect(invalidMethod.status).toBe(400)

		const unknownOrder = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/orders/2f1d3f8c-3a2b-4c1d-8e9f-0a1b2c3d4e5f`,
			{ headers: { Authorization: buyer.authorization } },
		)

		expect(unknownOrder.status).toBe(404)
	})
})
