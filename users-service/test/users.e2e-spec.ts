import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import type { Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator'
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity'
import { UsersController } from '../src/users/users.controller'

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

describe('Users queries', () => {
	let app: INestApplication
	let jwtService: JwtService
	let usersRepository: Repository<User>
	const trackedUserIds = new Set<string>()
	const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`

	const createUser = async ({
		label,
		role = UserRole.BUYER,
		status = UserStatus.ACTIVE,
	}: {
		label: string
		role?: UserRole
		status?: UserStatus
	}) => {
		const user = await usersRepository.save(
			usersRepository.create({
				email: `${label}-${runId}@example.invalid`,
				password: `sensitive-hash-${label}-${runId}`,
				firstName: 'First',
				lastName: 'Last',
				role,
				status,
			}),
		)

		trackedUserIds.add(user.id)

		return user
	}

	const signUserToken = (user: User) =>
		jwtService.sign({
			sub: user.id,
			email: user.email,
			role: user.role,
		})

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

	describe('GET /users/profile', () => {
		it('returns current database values for req.user.id without password', async () => {
			const authenticatedUser = await createUser({ label: 'profile-owner' })
			const otherUser = await createUser({ label: 'profile-other' })
			const token = signUserToken(authenticatedUser)
			const updatedEmail = `profile-updated-${runId}@example.invalid`

			await usersRepository.update(authenticatedUser.id, {
				email: updatedEmail,
				firstName: 'Updated',
				lastName: 'Profile',
				role: UserRole.SELLER,
				status: UserStatus.INACTIVE,
			})

			const response = await request(app.getHttpServer())
				.get(`/users/profile?id=${otherUser.id}&email=${otherUser.email}`)
				.set('Authorization', `Bearer ${token}`)
				.expect(200)

			expect(Object.keys(response.body).sort()).toEqual(publicUserFields)
			expect(response.body).toMatchObject({
				id: authenticatedUser.id,
				email: updatedEmail,
				firstName: 'Updated',
				lastName: 'Profile',
				role: UserRole.SELLER,
				status: UserStatus.INACTIVE,
			})
			expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false)
			expect(Number.isNaN(Date.parse(response.body.updatedAt))).toBe(false)
			expect(response.body).not.toHaveProperty('password')
			expect(JSON.stringify(response.body)).not.toContain(authenticatedUser.password)
		})

		it('returns 401 when the token identity no longer exists', async () => {
			const token = jwtService.sign({
				sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
				email: 'missing-profile@example.invalid',
				role: UserRole.BUYER,
			})

			const response = await request(app.getHttpServer())
				.get('/users/profile')
				.set('Authorization', `Bearer ${token}`)
				.expect(401)

			expect(response.body).toEqual({
				message: 'Unauthorized',
				statusCode: 401,
			})
		})
	})

	describe('GET /users/sellers', () => {
		it('returns all and only active sellers without passwords', async () => {
			const authenticatedUser = await createUser({ label: 'sellers-requester' })
			const firstActiveSeller = await createUser({
				label: 'seller-active-first',
				role: UserRole.SELLER,
			})
			const secondActiveSeller = await createUser({
				label: 'seller-active-second',
				role: UserRole.SELLER,
			})
			const inactiveSeller = await createUser({
				label: 'seller-inactive',
				role: UserRole.SELLER,
				status: UserStatus.INACTIVE,
			})
			const activeBuyer = await createUser({ label: 'sellers-active-buyer' })
			const token = signUserToken(authenticatedUser)

			const response = await request(app.getHttpServer())
				.get('/users/sellers')
				.set('Authorization', `Bearer ${token}`)
				.expect(200)

			const returnedIds = response.body.map((user: { id: string }) => user.id)

			expect(returnedIds).toEqual(
				expect.arrayContaining([firstActiveSeller.id, secondActiveSeller.id]),
			)
			expect(returnedIds).not.toContain(inactiveSeller.id)
			expect(returnedIds).not.toContain(activeBuyer.id)
			expect(response.body.length).toBeGreaterThanOrEqual(2)

			for (const user of response.body) {
				expect(Object.keys(user).sort()).toEqual(publicUserFields)
				expect(user).toMatchObject({
					role: UserRole.SELLER,
					status: UserStatus.ACTIVE,
				})
				expect(user).not.toHaveProperty('password')
			}

			const serializedResponse = JSON.stringify(response.body)
			expect(serializedResponse).not.toContain(firstActiveSeller.password)
			expect(serializedResponse).not.toContain(secondActiveSeller.password)
		})
	})

	describe('GET /users/:id', () => {
		it.each([
			{ role: UserRole.BUYER, status: UserStatus.INACTIVE },
			{ role: UserRole.SELLER, status: UserStatus.ACTIVE },
		])('returns a $status $role by UUID without password', async ({ role, status }) => {
			const authenticatedUser = await createUser({
				label: `lookup-requester-${role}-${status}`,
			})
			const requestedUser = await createUser({
				label: `lookup-target-${role}-${status}`,
				role,
				status,
			})
			const token = signUserToken(authenticatedUser)

			const response = await request(app.getHttpServer())
				.get(`/users/${requestedUser.id}`)
				.set('Authorization', `Bearer ${token}`)
				.expect(200)

			expect(Object.keys(response.body).sort()).toEqual(publicUserFields)
			expect(response.body).toMatchObject({
				id: requestedUser.id,
				email: requestedUser.email,
				role,
				status,
			})
			expect(response.body).not.toHaveProperty('password')
			expect(JSON.stringify(response.body)).not.toContain(requestedUser.password)
		})

		it('returns 404 with a stable message for an unknown UUID', async () => {
			const authenticatedUser = await createUser({ label: 'lookup-not-found' })
			const token = signUserToken(authenticatedUser)

			const response = await request(app.getHttpServer())
				.get('/users/6d45939e-0529-4cb6-b63a-f73271feb506')
				.set('Authorization', `Bearer ${token}`)
				.expect(404)

			expect(response.body).toMatchObject({
				message: 'Usuário não encontrado',
				statusCode: 404,
			})
		})

		it('returns 400 before querying for a malformed UUID', async () => {
			const authenticatedUser = await createUser({ label: 'lookup-invalid-uuid' })
			const token = signUserToken(authenticatedUser)

			const response = await request(app.getHttpServer())
				.get('/users/not-a-uuid')
				.set('Authorization', `Bearer ${token}`)
				.expect(400)

			expect(response.body.statusCode).toBe(400)
			expect(response.body.message).toContain('uuid')
		})
	})

	describe('JWT protection', () => {
		const protectedPaths = [
			'/users/profile',
			'/users/sellers',
			'/users/6d45939e-0529-4cb6-b63a-f73271feb506',
		]

		it.each(protectedPaths)('returns 401 for %s without a token', async (path) => {
			const response = await request(app.getHttpServer()).get(path).expect(401)

			expect(response.body).toEqual({
				message: 'Unauthorized',
				statusCode: 401,
			})
		})

		it.each(protectedPaths)(
			'returns 401 for %s with an invalid token',
			async (path) => {
				const response = await request(app.getHttpServer())
					.get(path)
					.set('Authorization', 'Bearer invalid-token')
					.expect(401)

				expect(response.body).toEqual({
					message: 'Unauthorized',
					statusCode: 401,
				})
			},
		)

		it.each(['getProfile', 'getActiveSellers', 'getById'] as const)(
			'does not mark UsersController.%s as public',
			(handler) => {
				expect(
					Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype[handler]),
				).toBeUndefined()
			},
		)
	})
})
