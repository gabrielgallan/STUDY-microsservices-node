import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { compare, getRounds } from 'bcryptjs'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import type { Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity'

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

describe('POST /auth/register', () => {
	let app: INestApplication
	let usersRepository: Repository<User>
	const trackedEmails = new Set<string>()
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	const trackEmail = (email: string) => {
		const normalizedEmail = email.trim().toLowerCase()
		trackedEmails.add(normalizedEmail)

		return normalizedEmail
	}

	const createPayload = (overrides: Record<string, unknown> = {}) => ({
		email: trackEmail(`buyer-${runId}@example.invalid`),
		password: 'password123',
		firstName: 'First',
		lastName: 'Last',
		role: UserRole.BUYER,
		...overrides,
	})

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		usersRepository = app.get<Repository<User>>(getRepositoryToken(User))
	})

	afterEach(async () => {
		await Promise.all(
			[...trackedEmails].map((email) => usersRepository.delete({ email })),
		)
		trackedEmails.clear()
	})

	afterAll(async () => {
		await app.close()
	})

	it.each([UserRole.SELLER, UserRole.BUYER])(
		'creates an active %s with a bcrypt password and public response',
		async (role) => {
			const rawEmail = `  ${role}-${runId}@Example.Invalid  `
			const normalizedEmail = trackEmail(rawEmail)
			const password = 'password123'
			const payload = createPayload({
				email: rawEmail,
				password,
				firstName: '  First  ',
				lastName: '  Last  ',
				role,
			})

			const response = await request(app.getHttpServer())
				.post('/auth/register')
				.send(payload)
				.expect(201)

			expect(Object.keys(response.body).sort()).toEqual(publicUserFields)
			expect(response.body).toMatchObject({
				email: normalizedEmail,
				firstName: 'First',
				lastName: 'Last',
				role,
				status: UserStatus.ACTIVE,
			})
			expect(response.body.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			)
			expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false)
			expect(Number.isNaN(Date.parse(response.body.updatedAt))).toBe(false)
			expect(response.body).not.toHaveProperty('password')

			const savedUser = await usersRepository.findOneByOrFail({
				email: normalizedEmail,
			})

			expect(savedUser.password).not.toBe(password)
			expect(getRounds(savedUser.password)).toBe(10)
			expect(await compare(password, savedUser.password)).toBe(true)
			expect(JSON.stringify(response.body)).not.toContain(password)
			expect(JSON.stringify(response.body)).not.toContain(savedUser.password)
		},
	)

	it.each([
		['missing email', { email: undefined }, 'email'],
		['empty email', { email: '   ' }, 'email'],
		['invalid email', { email: 'invalid-email' }, 'email'],
		['missing password', { password: undefined }, 'password'],
		['short password', { password: '12345' }, 'password'],
		['missing firstName', { firstName: undefined }, 'firstName'],
		['empty firstName', { firstName: '   ' }, 'firstName'],
		['long firstName', { firstName: 'a'.repeat(101) }, 'firstName'],
		['missing lastName', { lastName: undefined }, 'lastName'],
		['empty lastName', { lastName: '   ' }, 'lastName'],
		['long lastName', { lastName: 'a'.repeat(101) }, 'lastName'],
		['missing role', { role: undefined }, 'role'],
		['invalid role', { role: 'admin' }, 'role'],
	])('rejects %s', async (_case, overrides, expectedField) => {
		const payload = createPayload(overrides)
		const response = await request(app.getHttpServer())
			.post('/auth/register')
			.send(payload)
			.expect(400)

		expect(response.body.statusCode).toBe(400)
		expect(response.body.message).toBe('Validation failed')
		expect(Array.isArray(response.body.errors)).toBe(true)
		expect(
			response.body.errors.some(
				(error: { path?: string[] }) => error.path?.[0] === expectedField,
			),
		).toBe(true)
		expect(JSON.stringify(response.body)).not.toContain('password123')
	})

	it('returns every validation error and persists nothing', async () => {
		const email = trackEmail(`multiple-errors-${runId}@example.invalid`)
		const response = await request(app.getHttpServer())
			.post('/auth/register')
			.send({
				email: 'invalid-email',
				password: '12345',
				firstName: '',
				lastName: 'a'.repeat(101),
				role: 'admin',
			})
			.expect(400)

		const invalidFields = response.body.errors.map(
			(error: { path: string[] }) => error.path[0],
		)

		expect(new Set(invalidFields)).toEqual(
			new Set(['email', 'password', 'firstName', 'lastName', 'role']),
		)
		expect(await usersRepository.countBy({ email })).toBe(0)
	})

	it('rejects server-controlled and unknown fields', async () => {
		const payload = createPayload({
			status: UserStatus.INACTIVE,
			id: 'c04b5b91-38cb-4b9f-b37b-80009f1c5f94',
		})

		const response = await request(app.getHttpServer())
			.post('/auth/register')
			.send(payload)
			.expect(400)

		expect(
			response.body.errors.some(
				(error: { code: string }) => error.code === 'unrecognized_keys',
			),
		).toBe(true)
		expect(await usersRepository.countBy({ email: payload.email })).toBe(0)
	})

	it('returns conflict for an existing normalized email without changing it', async () => {
		const rawEmail = `  Duplicate-${runId}@Example.Invalid  `
		const normalizedEmail = trackEmail(rawEmail)
		const originalPayload = createPayload({ email: rawEmail })

		const createdResponse = await request(app.getHttpServer())
			.post('/auth/register')
			.send(originalPayload)
			.expect(201)

		const conflictResponse = await request(app.getHttpServer())
			.post('/auth/register')
			.send(
				createPayload({
					email: normalizedEmail.toUpperCase(),
					firstName: 'Changed',
				}),
			)
			.expect(409)

		expect(conflictResponse.body.message).toBe('Email already registered')
		expect(conflictResponse.body).not.toHaveProperty('password')
		expect(JSON.stringify(conflictResponse.body)).not.toContain('password123')
		expect(await usersRepository.countBy({ email: normalizedEmail })).toBe(1)

		const savedUser = await usersRepository.findOneByOrFail({
			email: normalizedEmail,
		})
		expect(savedUser.id).toBe(createdResponse.body.id)
		expect(savedUser.firstName).toBe('First')
	})

	it('maps concurrent unique violations to conflict', async () => {
		const email = trackEmail(`concurrent-${runId}@example.invalid`)
		const requests = Array.from({ length: 4 }, () =>
			request(app.getHttpServer())
				.post('/auth/register')
				.send(createPayload({ email })),
		)

		const responses = await Promise.all(requests)
		const statuses = responses.map((response) => response.status)

		expect(statuses.filter((status) => status === 201)).toHaveLength(1)
		expect(statuses.filter((status) => status === 409)).toHaveLength(3)
		expect(await usersRepository.countBy({ email })).toBe(1)
		for (const response of responses) {
			expect(response.body).not.toHaveProperty('password')
		}
	})

	it('does not expose out-of-scope authentication endpoints', async () => {
		await request(app.getHttpServer()).get('/').expect(404)
		await request(app.getHttpServer()).post('/auth/logout').send({}).expect(404)
	})
})
