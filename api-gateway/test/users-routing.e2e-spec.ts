import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
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
		expect(proxyRequest).toHaveBeenCalledWith(
			'users',
			'post',
			'/auth/login',
			payload,
		)
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
