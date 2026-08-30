import { Controller, Get, type INestApplication, Req } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import type { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface'
import { UserRole } from '../src/users/entities/user.entity'

@Controller('__test/protected')
class ProtectedControllerFixture {
	callCount = 0

	@Get()
	getIdentity(@Req() requestWithUser: { user: AuthenticatedUser }) {
		this.callCount += 1

		return requestWithUser.user
	}
}

describe('JWT route protection', () => {
	let app: INestApplication
	let jwtService: JwtService
	let protectedController: ProtectedControllerFixture

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
			controllers: [ProtectedControllerFixture],
		}).compile()

		app = testingModule.createNestApplication()
		await app.init()

		jwtService = app.get(JwtService)
		protectedController = app.get(ProtectedControllerFixture)
	})

	afterAll(async () => {
		await app.close()
	})

	it('rejects an unmarked route without a token before its handler runs', async () => {
		const callCountBeforeRequest = protectedController.callCount

		await request(app.getHttpServer()).get('/__test/protected').expect(401)

		expect(protectedController.callCount).toBe(callCountBeforeRequest)
	})

	it('injects exactly id, email and role for a valid service token', async () => {
		const identity = {
			id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'seller@example.invalid',
			role: UserRole.SELLER,
		}
		const token = jwtService.sign({
			sub: identity.id,
			email: identity.email,
			role: identity.role,
		})

		const response = await request(app.getHttpServer())
			.get('/__test/protected')
			.set('Authorization', `Bearer ${token}`)
			.expect(200)

		expect(response.body).toEqual(identity)
		expect(Object.keys(response.body).sort()).toEqual(['email', 'id', 'role'])
	})

	it('keeps the login route public even with an invalid token', async () => {
		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.set('Authorization', 'Bearer invalid-token')
			.send({
				email: 'missing-user@example.invalid',
				password: 'password123',
			})
			.expect(401)

		expect(response.body.message).toBe('Credenciais inválidas')
	})
})
