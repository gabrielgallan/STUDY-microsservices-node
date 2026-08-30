import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { hash } from 'bcryptjs'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import type { Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { envSchema } from '../src/env/env'
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity'

const jwtSecret = 'users-service-e2e-secret'
const publicUserFields = [
	'createdAt',
	'email',
	'firstName',
	'id',
	'lastName',
	'role',
	'status',
	'updatedAt',
]

interface DecodedJwt {
	sub: string
	email: string
	role: UserRole
	iat: number
	exp: number
}

describe('POST /auth/login', () => {
	let app: INestApplication
	let jwtService: JwtService
	let usersRepository: Repository<User>
	const trackedUserIds = new Set<string>()
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	const createUser = async ({
		label,
		role = UserRole.BUYER,
		status = UserStatus.ACTIVE,
		password = 'password123',
	}: {
		label: string
		role?: UserRole
		status?: UserStatus
		password?: string
	}) => {
		const user = await usersRepository.save(
			usersRepository.create({
				email: `${label}-${runId}@example.invalid`,
				password: await hash(password, 10),
				firstName: 'First',
				lastName: 'Last',
				role,
				status,
			}),
		)

		trackedUserIds.add(user.id)

		return user
	}

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		jwtService = app.get(JwtService)
		usersRepository = app.get<Repository<User>>(getRepositoryToken(User))
	})

	afterEach(async () => {
		await Promise.all([...trackedUserIds].map((id) => usersRepository.delete({ id })))
		trackedUserIds.clear()
	})

	afterAll(async () => {
		await app.close()
	})

	it.each([UserRole.SELLER, UserRole.BUYER])(
		'logs in an active %s and returns a valid 24-hour JWT',
		async (role) => {
			const password = 'password123'
			const user = await createUser({ label: `active-${role}`, role, password })
			const originalUpdatedAt = user.updatedAt.getTime()
			const response = await request(app.getHttpServer())
				.post('/auth/login')
				.send({
					email: `  ${user.email.toUpperCase()}  `,
					password,
				})
				.expect(200)

			expect(Object.keys(response.body).sort()).toEqual(['token', 'user'])
			expect(Object.keys(response.body.user).sort()).toEqual(publicUserFields)
			expect(response.body.user).toMatchObject({
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				role,
				status: UserStatus.ACTIVE,
			})
			expect(typeof response.body.token).toBe('string')
			expect(response.body.token.length).toBeGreaterThan(0)
			expect(response.body.user).not.toHaveProperty('password')

			const decoded = await jwtService.verifyAsync<DecodedJwt>(response.body.token)

			expect(Object.keys(decoded).sort()).toEqual([
				'email',
				'exp',
				'iat',
				'role',
				'sub',
			])
			expect(decoded).toMatchObject({
				sub: user.id,
				email: user.email,
				role,
			})
			expect(decoded.exp - decoded.iat).toBe(86_400)
			await expect(
				jwtService.verifyAsync(response.body.token, { secret: 'wrong-secret' }),
			).rejects.toThrow()

			const serializedResponse = JSON.stringify(response.body)
			expect(serializedResponse).not.toContain(password)
			expect(serializedResponse).not.toContain(user.password)
			expect(serializedResponse).not.toContain(jwtSecret)

			const unchangedUser = await usersRepository.findOneByOrFail({ id: user.id })
			expect(unchangedUser.password).toBe(user.password)
			expect(unchangedUser.status).toBe(user.status)
			expect(unchangedUser.updatedAt.getTime()).toBe(originalUpdatedAt)
		},
	)

	it('uses an indistinguishable response for unknown email and wrong password', async () => {
		const user = await createUser({ label: 'invalid-credentials' })
		const unknownEmailResponse = await request(app.getHttpServer())
			.post('/auth/login')
			.send({
				email: `unknown-${runId}@example.invalid`,
				password: 'password123',
			})
			.expect(401)
		const wrongPasswordResponse = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: user.email, password: 'wrong-password' })
			.expect(401)

		expect(unknownEmailResponse.body).toEqual(wrongPasswordResponse.body)
		expect(unknownEmailResponse.body.message).toBe('Credenciais inválidas')
		expect(unknownEmailResponse.body).not.toHaveProperty('user')
		expect(unknownEmailResponse.body).not.toHaveProperty('token')
	})

	it('reveals inactive status only after the password is validated', async () => {
		const password = 'password123'
		const user = await createUser({
			label: 'inactive',
			password,
			status: UserStatus.INACTIVE,
		})

		const wrongPasswordResponse = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: user.email, password: 'wrong-password' })
			.expect(401)
		expect(wrongPasswordResponse.body.message).toBe('Credenciais inválidas')

		const inactiveResponse = await request(app.getHttpServer())
			.post('/auth/login')
			.send({ email: user.email, password })
			.expect(401)
		expect(inactiveResponse.body.message).toBe('Conta inativa')
		expect(inactiveResponse.body).not.toHaveProperty('user')
		expect(inactiveResponse.body).not.toHaveProperty('token')
	})

	it.each([
		['missing email', { password: 'password123' }, 'email'],
		['empty email', { email: '   ', password: 'password123' }, 'email'],
		['invalid email', { email: 'invalid', password: 'password123' }, 'email'],
		['missing password', { email: 'user@example.invalid' }, 'password'],
		[
			'short password',
			{ email: 'user@example.invalid', password: '12345' },
			'password',
		],
	])('rejects %s', async (_case, payload, expectedField) => {
		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send(payload)
			.expect(400)

		expect(response.body.message).toBe('Validation failed')
		expect(
			response.body.errors.some(
				(error: { path?: string[] }) => error.path?.[0] === expectedField,
			),
		).toBe(true)
		expect(response.body).not.toHaveProperty('token')
	})

	it('rejects additional fields', async () => {
		const response = await request(app.getHttpServer())
			.post('/auth/login')
			.send({
				email: 'user@example.invalid',
				password: 'password123',
				status: UserStatus.ACTIVE,
			})
			.expect(400)

		expect(
			response.body.errors.some(
				(error: { code: string }) => error.code === 'unrecognized_keys',
			),
		).toBe(true)
	})

	it('requires a non-empty JWT_SECRET in the environment schema', () => {
		const missingSecret = envSchema.safeParse({})
		const emptySecret = envSchema.safeParse({ JWT_SECRET: '   ' })

		expect(missingSecret.success).toBe(false)
		expect(emptySecret.success).toBe(false)
	})
})
