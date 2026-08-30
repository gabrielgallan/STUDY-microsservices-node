import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { UserRole } from '../src/users/entities/user.entity'

describe('GET /auth/validate-token', () => {
	let app: INestApplication
	let jwtService: JwtService

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		jwtService = app.get(JwtService)
	})

	afterAll(async () => {
		await app.close()
	})

	it('returns exactly the authenticated identity for a valid JWT', async () => {
		const identity = {
			userId: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'seller@example.invalid',
			role: UserRole.SELLER,
		}
		const token = jwtService.sign({
			sub: identity.userId,
			email: identity.email,
			role: identity.role,
			password: 'must-not-be-returned',
		})

		const response = await request(app.getHttpServer())
			.get('/auth/validate-token')
			.set('Authorization', `Bearer ${token}`)
			.expect(200)

		expect(response.body).toEqual(identity)
		expect(Object.keys(response.body).sort()).toEqual([
			'email',
			'role',
			'userId',
		])
	})

	it.each([
		['a missing token', undefined],
		['a malformed token', 'Bearer invalid-token'],
		[
			'an expired token',
			() =>
				`Bearer ${jwtService.sign(
					{
						sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
						email: 'buyer@example.invalid',
						role: UserRole.BUYER,
					},
					{ expiresIn: -1 },
				)}`,
		],
		[
			'a token signed with another secret',
			() =>
				`Bearer ${jwtService.sign(
					{
						sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
						email: 'buyer@example.invalid',
						role: UserRole.BUYER,
					},
					{ secret: 'another-secret' },
				)}`,
		],
		[
			'a token with invalid claims',
			() =>
				`Bearer ${jwtService.sign({
					sub: 'not-a-uuid',
					email: 'not-an-email',
					role: 'admin',
				})}`,
		],
	] as const)('rejects %s', async (_label, authorization) => {
		const pendingRequest = request(app.getHttpServer()).get(
			'/auth/validate-token',
		)
		const header =
			typeof authorization === 'function' ? authorization() : authorization

		if (header) {
			pendingRequest.set('Authorization', header)
		}

		const response = await pendingRequest.expect(401)

		expect(response.body).toEqual({
			message: 'Unauthorized',
			statusCode: 401,
		})
	})
})
