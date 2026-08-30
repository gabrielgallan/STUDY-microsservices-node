import { Controller, Get, type INestApplication, Req } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { Public } from '../src/auth/decorators/public.decorator'
import type { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'

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
	callCount = 0

	@Get()
	getPublicResponse() {
		this.callCount += 1
		return { public: true }
	}
}

describe('JWT route protection', () => {
	let app: INestApplication
	let jwtService: JwtService
	let protectedController: ProtectedControllerFixture
	let publicController: PublicControllerFixture

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
			controllers: [ProtectedControllerFixture, PublicControllerFixture],
		}).compile()

		app = testingModule.createNestApplication()
		await app.init()

		jwtService = app.get(JwtService)
		protectedController = app.get(ProtectedControllerFixture)
		publicController = app.get(PublicControllerFixture)
	})

	afterAll(async () => {
		await app.close()
	})

	it('rejects a protected route without a token before its handler runs', async () => {
		const callCountBeforeRequest = protectedController.callCount

		await request(app.getHttpServer()).get('/__test/protected').expect(401)

		expect(protectedController.callCount).toBe(callCountBeforeRequest)
	})

	it('injects exactly id, email and role for a valid token', async () => {
		const identity = {
			id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'seller@example.invalid',
			role: UserRole.SELLER,
		}
		const token = jwtService.sign({
			sub: identity.id,
			email: identity.email,
			role: identity.role,
			password: 'must-not-be-propagated',
			status: 'active',
			token: 'must-not-be-propagated',
		})

		const response = await request(app.getHttpServer())
			.get('/__test/protected')
			.set('Authorization', `Bearer ${token}`)
			.expect(200)

		expect(response.body).toEqual(identity)
		expect(Object.keys(response.body).sort()).toEqual(['email', 'id', 'role'])
	})

	it.each([
		{
			label: 'a header without the Bearer scheme',
			getAuthorization: () => 'Basic opaque-value',
		},
		{
			label: 'a malformed token',
			getAuthorization: () => 'Bearer invalid-token',
		},
		{
			label: 'an expired token',
			getAuthorization: (service: JwtService) =>
				`Bearer ${service.sign(
					{
						sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
						email: 'buyer@example.invalid',
						role: UserRole.BUYER,
					},
					{ expiresIn: -1 },
				)}`,
		},
		{
			label: 'a token signed with another secret',
			getAuthorization: (service: JwtService) =>
				`Bearer ${service.sign(
					{
						sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
						email: 'buyer@example.invalid',
						role: UserRole.BUYER,
					},
					{ secret: 'another-secret' },
				)}`,
		},
		{
			label: 'missing domain claims',
			getAuthorization: (service: JwtService) => `Bearer ${service.sign({})}`,
		},
		{
			label: 'a non-UUID subject',
			getAuthorization: (service: JwtService) =>
				`Bearer ${service.sign({
					sub: 'not-a-uuid',
					email: 'buyer@example.invalid',
					role: UserRole.BUYER,
				})}`,
		},
		{
			label: 'an invalid email claim',
			getAuthorization: (service: JwtService) =>
				`Bearer ${service.sign({
					sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
					email: 'not-an-email',
					role: UserRole.BUYER,
				})}`,
		},
		{
			label: 'an invalid role claim',
			getAuthorization: (service: JwtService) =>
				`Bearer ${service.sign({
					sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
					email: 'buyer@example.invalid',
					role: 'admin',
				})}`,
		},
	])('rejects $label without executing the handler', async ({ getAuthorization }) => {
		const callCountBeforeRequest = protectedController.callCount
		const authorization = getAuthorization(jwtService)

		const response = await request(app.getHttpServer())
			.get('/__test/protected')
			.set('Authorization', authorization)
			.expect(401)

		expect(response.body).toEqual({
			message: 'Unauthorized',
			statusCode: 401,
		})
		expect(JSON.stringify(response.body)).not.toContain(authorization)
		expect(protectedController.callCount).toBe(callCountBeforeRequest)
	})

	it('allows a public route without a token', async () => {
		const callCountBeforeRequest = publicController.callCount

		await request(app.getHttpServer())
			.get('/__test/public')
			.expect(200, { public: true })

		expect(publicController.callCount).toBe(callCountBeforeRequest + 1)
	})

	it('allows a public route with an invalid token', async () => {
		const callCountBeforeRequest = publicController.callCount

		await request(app.getHttpServer())
			.get('/__test/public')
			.set('Authorization', 'Bearer invalid-token')
			.expect(200, { public: true })

		expect(publicController.callCount).toBe(callCountBeforeRequest + 1)
	})
})
