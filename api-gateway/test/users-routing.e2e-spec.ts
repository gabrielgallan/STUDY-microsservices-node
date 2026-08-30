import {
	type CanActivate,
	type ExecutionContext,
	HttpException,
	type INestApplication,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import type { UserPayload } from '../src/auth/strategies/jwt.strategy'
import { ProxyService } from '../src/proxy/service/proxy.service'

const identity: UserPayload = {
	userId: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
	email: 'seller@example.invalid',
	role: 'seller',
}

class AuthenticatedGuardFixture implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		context.switchToHttp().getRequest().user = identity

		return true
	}
}

describe('Gateway users-service routing', () => {
	let app: INestApplication
	const proxyRequest = jest.fn()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ProxyService)
			.useValue({ proxyRequest })
			.overrideGuard(JwtAuthGuard)
			.useClass(AuthenticatedGuardFixture)
			.compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()
	})

	beforeEach(() => {
		proxyRequest.mockReset()
	})

	afterAll(async () => {
		await app.close()
	})

	it('forwards POST /auth/register to the users-service contract', async () => {
		const payload = {
			email: 'seller@example.invalid',
			password: 'password123',
			firstName: 'First',
			lastName: 'Last',
			role: 'seller',
		}
		const publicUser = {
			id: identity.userId,
			email: payload.email,
			firstName: payload.firstName,
			lastName: payload.lastName,
			role: payload.role,
			status: 'active',
			createdAt: '2026-08-30T00:00:00.000Z',
			updatedAt: '2026-08-30T00:00:00.000Z',
		}
		proxyRequest.mockResolvedValueOnce(publicUser)

		const response = await request(app.getHttpServer())
			.post('/auth/register')
			.send(payload)
			.expect(201)

		expect(response.body).toEqual(publicUser)
		expect(proxyRequest).toHaveBeenCalledWith(
			'users',
			'post',
			'/auth/register',
			payload,
		)
	})

	it('forwards POST /auth/login and preserves the token response', async () => {
		const payload = {
			email: 'seller@example.invalid',
			password: 'password123',
		}
		const loginResponse = {
			user: { id: identity.userId, email: payload.email, role: identity.role },
			token: 'signed-jwt',
		}
		proxyRequest.mockResolvedValueOnce(loginResponse)

		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send(payload)
			.expect(200)

		expect(response.body).toEqual(loginResponse)
		expect(proxyRequest).toHaveBeenCalledWith('users', 'post', '/auth/login', payload)
	})

	it.each([
		['profile', '/users/profile', '/users/profile', { id: identity.userId }],
		['sellers', '/users/sellers', '/users/sellers', [identity]],
	])(
		'forwards the original Bearer header for %s',
		async (_case, publicPath, servicePath, serviceResponse) => {
			const authorization = 'Bearer original-jwt'
			proxyRequest.mockResolvedValueOnce(serviceResponse)

			const response = await request(app.getHttpServer())
				.get(publicPath)
				.set('Authorization', authorization)
				.expect(200)

			expect(response.body).toEqual(serviceResponse)
			expect(proxyRequest).toHaveBeenCalledWith(
				'users',
				'get',
				servicePath,
				undefined,
				{ Authorization: authorization },
				identity,
			)
		},
	)
})

describe('Gateway users route protection', () => {
	let app: INestApplication

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ProxyService)
			.useValue({ proxyRequest: jest.fn() })
			.compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()
	})

	afterAll(async () => {
		await app.close()
	})

	it.each(['/users/profile', '/users/sellers'])(
		'returns 401 for %s without a token',
		async (path) => {
			await request(app.getHttpServer()).get(path).expect(401)
		},
	)

	it.each(['/users/profile', '/users/sellers'])(
		'returns 401 for %s with an invalid token',
		async (path) => {
			await request(app.getHttpServer())
				.get(path)
				.set('Authorization', 'Bearer invalid-token')
				.expect(401)
		},
	)
})

describe('Gateway JWT validation through ProxyService', () => {
	let app: INestApplication
	let jwtService: JwtService
	const proxyRequest = jest.fn()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ProxyService)
			.useValue({ proxyRequest })
			.compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		jwtService = app.get(JwtService)
	})

	beforeEach(() => {
		proxyRequest.mockReset()
	})

	afterAll(async () => {
		await app.close()
	})

	const createAuthorization = () => {
		const token = jwtService.sign({
			sub: identity.userId,
			email: identity.email,
			role: identity.role,
		})

		return `Bearer ${token}`
	}

	it.each([
		['profile', '/users/profile', '/users/profile', { id: identity.userId }],
		['sellers', '/users/sellers', '/users/sellers', [identity]],
	])(
		'validates JWT through the proxy before forwarding %s',
		async (_case, publicPath, servicePath, serviceResponse) => {
			const authorization = createAuthorization()
			proxyRequest
				.mockResolvedValueOnce(identity)
				.mockResolvedValueOnce(serviceResponse)

			const response = await request(app.getHttpServer())
				.get(publicPath)
				.set('Authorization', authorization)
				.expect(200)

			expect(response.body).toEqual(serviceResponse)
			expect(proxyRequest).toHaveBeenCalledTimes(2)
			expect(proxyRequest).toHaveBeenNthCalledWith(
				1,
				'users',
				'get',
				'/auth/validate-token',
				undefined,
				{ Authorization: authorization },
			)
			expect(proxyRequest).toHaveBeenNthCalledWith(
				2,
				'users',
				'get',
				servicePath,
				undefined,
				{ Authorization: authorization },
				identity,
			)
		},
	)

	it.each([
		['an empty response', null],
		['an incomplete identity', { userId: identity.userId }],
		['an invalid identity', { ...identity, role: 'admin' }],
		['a fallback response', 'Service unavailable. Please try again later.'],
	])('does not authenticate from %s', async (_case, validationResponse) => {
		const authorization = createAuthorization()
		proxyRequest.mockResolvedValueOnce(validationResponse)

		await request(app.getHttpServer())
			.get('/users/profile')
			.set('Authorization', authorization)
			.expect(401)

		expect(proxyRequest).toHaveBeenCalledTimes(1)
		expect(proxyRequest).toHaveBeenCalledWith(
			'users',
			'get',
			'/auth/validate-token',
			undefined,
			{ Authorization: authorization },
		)
	})

	it('preserves a downstream 401 and does not forward the protected route', async () => {
		const authorization = createAuthorization()
		const downstreamResponse = {
			statusCode: 401,
			message: 'Unauthorized',
		}
		proxyRequest.mockRejectedValueOnce(new HttpException(downstreamResponse, 401))

		const response = await request(app.getHttpServer())
			.get('/users/profile')
			.set('Authorization', authorization)
			.expect(401)

		expect(response.body).toEqual(downstreamResponse)
		expect(proxyRequest).toHaveBeenCalledTimes(1)
	})

	it('fails closed when JWT validation through the proxy fails', async () => {
		const authorization = createAuthorization()
		proxyRequest.mockRejectedValueOnce(new Error('users-service unavailable'))

		await request(app.getHttpServer())
			.get('/users/profile')
			.set('Authorization', authorization)
			.expect(500)

		expect(proxyRequest).toHaveBeenCalledTimes(1)
	})
})
