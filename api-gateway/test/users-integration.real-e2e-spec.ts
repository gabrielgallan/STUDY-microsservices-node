import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import path from 'node:path'
import { Client } from 'pg'

const USERS_PORT = 3001
const PRODUCTS_PORT = 3002
const GATEWAY_PORT = 3005
const JWT_SECRET = 'gateway-users-real-e2e-secret'
const USERS_URL = `http://127.0.0.1:${USERS_PORT}`
const PRODUCTS_URL = `http://127.0.0.1:${PRODUCTS_PORT}`
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`
const workspaceRoot = path.resolve(__dirname, '..', '..')
const usersServiceRoot = path.join(workspaceRoot, 'users-service')
const productsServiceRoot = path.join(workspaceRoot, 'products-service')
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

const requestJson = async <T>(
	url: string,
	init?: RequestInit,
): Promise<HttpResult<T>> => {
	const response = await fetch(url, init)
	const body = (await response.json()) as T

	return { status: response.status, body }
}

describe('marketplace services through the real api-gateway', () => {
	jest.setTimeout(120_000)

	let usersService: RunningService | undefined
	let productsService: RunningService | undefined
	let gateway: RunningService | undefined
	let registeredEmail: string | undefined
	let registeredUserId: string | undefined
	let buyerEmail: string | undefined
	let accessToken: string | undefined
	let createdProductId: string | undefined
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	beforeAll(async () => {
		await Promise.all([
			assertPortIsFree(USERS_PORT),
			assertPortIsFree(PRODUCTS_PORT),
			assertPortIsFree(GATEWAY_PORT),
		])

		usersService = startService(
			usersServiceRoot,
			path.join(usersServiceRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(USERS_PORT),
				JWT_SECRET,
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5435/users',
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
				DATABASE_URL: 'postgresql://docker:docker@127.0.0.1:5436/products',
			},
		)
		await waitForService(`${PRODUCTS_URL}/health`, productsService)

		gateway = startService(
			gatewayRoot,
			path.join(gatewayRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(GATEWAY_PORT),
				JWT_SECRET,
				USERS_SERVICE_URL: USERS_URL,
				PRODUCTS_SERVICE_URL: PRODUCTS_URL,
				CHECKOUT_SERVICE_URL: 'http://127.0.0.1:65532',
				PAYMENTS_SERVICE_URL: 'http://127.0.0.1:65533',
				CORS_ORIGINS: '*',
			},
		)
		await waitForService(`${GATEWAY_URL}/health`, gateway)
	})

	afterAll(async () => {
		if (createdProductId) {
			const database = new Client({
				host: '127.0.0.1',
				port: 5436,
				user: 'docker',
				password: 'docker',
				database: 'products',
			})

			try {
				await database.connect()
				await database.query('DELETE FROM products WHERE id = $1', [createdProductId])
			} finally {
				await database.end().catch(() => undefined)
			}
		}

		const registeredEmails = [registeredEmail, buyerEmail].filter(
			(email): email is string => Boolean(email),
		)
		if (registeredEmails.length > 0) {
			const database = new Client({
				host: '127.0.0.1',
				port: 5435,
				user: 'docker',
				password: 'docker',
				database: 'users',
			})

			try {
				await database.connect()
				await database.query('DELETE FROM users WHERE email = ANY($1)', [
					registeredEmails,
				])
			} finally {
				await database.end().catch(() => undefined)
			}
		}

		await stopService(gateway)
		await stopService(productsService)
		await stopService(usersService)
	})

	it('registers, logs in and queries profile and sellers through port 3005', async () => {
		registeredEmail = `gateway-e2e-${runId}@example.invalid`
		const registrationPayload = {
			email: registeredEmail,
			password: 'password123',
			firstName: 'Gateway',
			lastName: 'Seller',
			role: 'seller',
		}

		const registration = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/auth/register`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(registrationPayload),
			},
		)

		expect(registration.status).toBe(201)
		expect(registration.body).toMatchObject({
			email: registeredEmail,
			firstName: 'Gateway',
			lastName: 'Seller',
			role: 'seller',
			status: 'active',
		})
		expect(registration.body).not.toHaveProperty('password')
		registeredUserId = registration.body.id as string

		const login = await requestJson<{
			token: string
			user: Record<string, unknown>
		}>(`${GATEWAY_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: registeredEmail,
				password: registrationPayload.password,
			}),
		})

		expect(login.status).toBe(200)
		expect(login.body.user).toMatchObject({
			email: registeredEmail,
			role: 'seller',
		})
		expect(typeof login.body.token).toBe('string')
		accessToken = login.body.token

		const authorization = `Bearer ${accessToken}`
		const validation = await requestJson<{
			userId: string
			email: string
			role: string
		}>(`${USERS_URL}/auth/validate-token`, {
			headers: { Authorization: authorization },
		})

		expect(validation.status).toBe(200)
		expect(validation.body).toEqual({
			userId: registration.body.id,
			email: registeredEmail,
			role: 'seller',
		})

		const profile = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/users/profile`,
			{ headers: { Authorization: authorization } },
		)

		if (profile.status !== 200) {
			throw new Error(
				`Profile request failed with ${profile.status}: ${JSON.stringify(profile.body)}\nGateway output:\n${gateway?.getOutput() ?? ''}`,
			)
		}

		expect(profile.status).toBe(200)
		expect(profile.body).toMatchObject({
			id: registration.body.id,
			email: registeredEmail,
			role: 'seller',
			status: 'active',
		})
		expect(profile.body).not.toHaveProperty('password')

		const sellers = await requestJson<Array<Record<string, unknown>>>(
			`${GATEWAY_URL}/users/sellers`,
			{ headers: { Authorization: authorization } },
		)

		expect(sellers.status).toBe(200)
		expect(sellers.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: registration.body.id,
					email: registeredEmail,
					role: 'seller',
					status: 'active',
				}),
			]),
		)
		for (const seller of sellers.body) {
			expect(seller).toMatchObject({ role: 'seller', status: 'active' })
			expect(seller).not.toHaveProperty('password')
		}
	})

	it('creates and queries a product through port 3005', async () => {
		if (!accessToken || !registeredUserId) {
			throw new Error('The seller login flow did not provide an identity and token')
		}

		const authorization = `Bearer ${accessToken}`
		const payload = {
			name: `Gateway product ${runId}`,
			description: 'Product created by the real gateway integration suite',
			price: 49.9,
			stock: 7,
		}
		const creation = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/products`,
			{
				method: 'POST',
				headers: {
					Authorization: authorization,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
		)

		expect(creation.status).toBe(201)
		expect(creation.body).toMatchObject({
			...payload,
			sellerId: registeredUserId,
			isActive: true,
		})
		createdProductId = creation.body.id as string

		const database = new Client({
			host: '127.0.0.1',
			port: 5436,
			user: 'docker',
			password: 'docker',
			database: 'products',
		})
		try {
			await database.connect()
			const persisted = await database.query(
				'SELECT COUNT(*)::int AS count FROM products WHERE id = $1',
				[createdProductId],
			)
			expect(persisted.rows[0].count).toBe(1)
		} finally {
			await database.end()
		}

		const catalog = await requestJson<Array<Record<string, unknown>>>(
			`${GATEWAY_URL}/products`,
		)
		expect(catalog.status).toBe(200)
		expect(catalog.body).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: createdProductId, sellerId: registeredUserId }),
			]),
		)

		const sellerProducts = await requestJson<Array<Record<string, unknown>>>(
			`${GATEWAY_URL}/products/seller/${registeredUserId}`,
		)
		expect(sellerProducts.status).toBe(200)
		expect(sellerProducts.body).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: createdProductId })]),
		)

		const product = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/products/${createdProductId}`,
		)
		expect(product.status).toBe(200)
		expect(product.body).toMatchObject({
			id: createdProductId,
			sellerId: registeredUserId,
		})
	})

	it('preserves product authentication, authorization and not-found errors', async () => {
		const payload = {
			name: 'Rejected gateway product',
			description: 'This product must never be persisted',
			price: 10,
			stock: 1,
		}
		for (const authorization of [undefined, 'Bearer invalid-token']) {
			const headers: Record<string, string> = { 'Content-Type': 'application/json' }
			if (authorization) {
				headers.Authorization = authorization
			}

			const response = await requestJson<Record<string, unknown>>(
				`${GATEWAY_URL}/products`,
				{ method: 'POST', headers, body: JSON.stringify(payload) },
			)
			expect(response.status).toBe(401)
		}

		buyerEmail = `gateway-buyer-${runId}@example.invalid`
		const buyerPassword = 'password123'
		const registration = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/auth/register`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email: buyerEmail,
					password: buyerPassword,
					firstName: 'Gateway',
					lastName: 'Buyer',
					role: 'buyer',
				}),
			},
		)
		expect(registration.status).toBe(201)

		const login = await requestJson<{ token: string }>(`${GATEWAY_URL}/auth/login`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email: buyerEmail, password: buyerPassword }),
		})
		expect(login.status).toBe(200)

		const forbidden = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/products`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${login.body.token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			},
		)
		expect(forbidden.status).toBe(403)
		expect(forbidden.body).toMatchObject({
			message: 'Apenas vendedores podem criar produtos',
			statusCode: 403,
		})

		const missingProduct = await requestJson<Record<string, unknown>>(
			`${GATEWAY_URL}/products/${randomUUID()}`,
		)
		expect(missingProduct.status).toBe(404)
		expect(missingProduct.body).toMatchObject({
			message: 'Produto não encontrado',
			statusCode: 404,
		})
	})

	it.each(['/users/profile', '/users/sellers'])(
		'rejects unauthenticated and invalid requests to %s',
		async (route) => {
			const withoutToken = await requestJson<Record<string, unknown>>(
				`${GATEWAY_URL}${route}`,
			)
			const invalidToken = await requestJson<Record<string, unknown>>(
				`${GATEWAY_URL}${route}`,
				{ headers: { Authorization: 'Bearer invalid-token' } },
			)

			expect(withoutToken.status).toBe(401)
			expect(invalidToken.status).toBe(401)
		},
	)

	it('reports the real users-service as healthy through the gateway', async () => {
		const health = await requestJson<{
			services: Array<{ name: string; status: string; url: string }>
		}>(`${GATEWAY_URL}/health/services`)

		expect(health.status).toBe(200)
		expect(health.body.services).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'users',
					status: 'healthy',
					url: USERS_URL,
				}),
			]),
		)
	})

	it('reports the real products-service as healthy through the gateway', async () => {
		const health = await requestJson<{
			services: Array<{ name: string; status: string; url: string }>
		}>(`${GATEWAY_URL}/health/services`)

		expect(health.status).toBe(200)
		expect(health.body.services).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: 'products',
					status: 'healthy',
					url: PRODUCTS_URL,
				}),
			]),
		)
	})
})
