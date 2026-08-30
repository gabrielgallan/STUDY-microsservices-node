import { Controller, Get, type INestApplication, Req } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { Public } from '../src/auth/decorators/public.decorator'
import type { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'
import { configureSwagger } from '../src/config/swagger.config'
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'

@Controller('__test/protected')
class ProtectedControllerFixture {
	callCount = 0

	@Get()
	getIdentity(@Req() requestWithUser: { user: AuthenticatedUser }) {
		this.callCount += 1
		return requestWithUser.user
	}
}

@Public()
@Controller('__test/public')
class PublicControllerFixture {
	@Get()
	getPublicResponse() {
		return { public: true }
	}
}

describe('Checkout HTTP infrastructure (e2e)', () => {
	let app: INestApplication
	let jwtService: JwtService
	let protectedController: ProtectedControllerFixture
	const publishMessage = jest.fn()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
			controllers: [ProtectedControllerFixture, PublicControllerFixture],
		})
			.overrideProvider(RabbitmqService)
			.useValue({
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
				publishMessage,
			})
			.compile()

		app = testingModule.createNestApplication()
		configureSwagger(app)
		await app.init()

		jwtService = app.get(JwtService)
		protectedController = app.get(ProtectedControllerFixture)
	})

	afterAll(async () => {
		await app.close()
	})

	const createValidToken = () =>
		jwtService.sign({
			sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
		})

	it('returns the exact public health response without authentication', async () => {
		await request(app.getHttpServer()).get('/health').expect(200, {
			status: 'ok',
			service: 'checkout-service',
		})
	})

	it('keeps health public even when an invalid token is sent', async () => {
		await request(app.getHttpServer())
			.get('/health')
			.set('Authorization', 'Bearer invalid-token')
			.expect(200)
	})

	it('protects routes globally and does not execute a rejected handler', async () => {
		const callsBeforeRequest = protectedController.callCount

		await request(app.getHttpServer()).get('/__test/protected').expect(401)
		await request(app.getHttpServer())
			.get('/__test/protected')
			.set('Authorization', 'Bearer invalid-token')
			.expect(401)

		expect(protectedController.callCount).toBe(callsBeforeRequest)
	})

	it('exposes only the normalized identity for a valid token', async () => {
		await request(app.getHttpServer())
			.get('/__test/protected')
			.set('Authorization', `Bearer ${createValidToken()}`)
			.expect(200, {
				id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
				email: 'buyer@example.invalid',
				role: 'buyer',
			})
	})

	it('allows a public controller with no token or an invalid token', async () => {
		await request(app.getHttpServer())
			.get('/__test/public')
			.expect(200, { public: true })
		await request(app.getHttpServer())
			.get('/__test/public')
			.set('Authorization', 'Bearer invalid-token')
			.expect(200, { public: true })
	})

	it('serves Swagger with service metadata and Bearer JWT', async () => {
		await request(app.getHttpServer()).get('/api').expect(200)
		const response = await request(app.getHttpServer()).get('/api-json').expect(200)

		expect(response.body.info).toMatchObject({
			title: 'Checkout Service',
			version: '1.0',
		})
		expect(response.body.components.securitySchemes.bearer).toEqual({
			type: 'http',
			scheme: 'bearer',
			bearerFormat: 'JWT',
		})
		expect(response.body.paths).toHaveProperty('/health')
	})
})
