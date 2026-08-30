import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { Client } from 'pg'

const USERS_PORT = 3001
const GATEWAY_PORT = 3005
const JWT_SECRET = 'gateway-users-real-e2e-secret'
const USERS_URL = `http://127.0.0.1:${USERS_PORT}`
const GATEWAY_URL = `http://127.0.0.1:${GATEWAY_PORT}`
const workspaceRoot = path.resolve(__dirname, '..', '..')
const usersServiceRoot = path.join(workspaceRoot, 'users-service')
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
			throw new Error(
				`Service exited before becoming ready.\n${service.getOutput()}`,
			)
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

describe('users-service through the real api-gateway', () => {
	jest.setTimeout(120_000)

	let usersService: RunningService | undefined
	let gateway: RunningService | undefined
	let registeredEmail: string | undefined
	let accessToken: string | undefined
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	beforeAll(async () => {
		await Promise.all([
			assertPortIsFree(USERS_PORT),
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

		gateway = startService(
			gatewayRoot,
			path.join(gatewayRoot, 'dist', 'src', 'main.js'),
			{
				NODE_ENV: 'test',
				PORT: String(GATEWAY_PORT),
				JWT_SECRET,
				USERS_SERVICE_URL: USERS_URL,
				PRODUCTS_SERVICE_URL: 'http://127.0.0.1:65531',
				CHECKOUT_SERVICE_URL: 'http://127.0.0.1:65532',
				PAYMENTS_SERVICE_URL: 'http://127.0.0.1:65533',
				CORS_ORIGINS: '*',
			},
		)
		await waitForService(`${GATEWAY_URL}/health`, gateway)
	})

	afterAll(async () => {
		if (registeredEmail) {
			const database = new Client({
				host: '127.0.0.1',
				port: 5435,
				user: 'docker',
				password: 'docker',
				database: 'users',
			})

			try {
				await database.connect()
				await database.query('DELETE FROM users WHERE email = $1', [
					registeredEmail,
				])
			} finally {
				await database.end().catch(() => undefined)
			}
		}

		await stopService(gateway)
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
})
