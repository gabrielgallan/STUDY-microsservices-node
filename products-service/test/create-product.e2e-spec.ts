import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import type { Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'
import { Product } from '../src/products/entities/product.entity'

const productFields = [
	'createdAt',
	'description',
	'id',
	'isActive',
	'name',
	'price',
	'sellerId',
	'stock',
	'updatedAt',
]

describe('POST /products', () => {
	let app: INestApplication
	let jwtService: JwtService
	let productsRepository: Repository<Product>
	const trackedSellerIds = new Set<string>()

	const createPayload = (overrides: Record<string, unknown> = {}) => ({
		name: 'Marketplace product',
		description: 'Product created through the API',
		price: 19.99,
		stock: 10,
		...overrides,
	})

	const createAuthorization = (
		role: UserRole,
		options: { expiresIn?: number } = {},
	) => {
		const sellerId = randomUUID()
		trackedSellerIds.add(sellerId)
		const token = jwtService.sign(
			{
				sub: sellerId,
				email: `${role}-${sellerId}@example.invalid`,
				role,
			},
			options,
		)

		return { sellerId, authorization: `Bearer ${token}` }
	}

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		jwtService = app.get(JwtService)
		productsRepository = app.get(getRepositoryToken(Product))
	})

	afterEach(async () => {
		await Promise.all(
			[...trackedSellerIds].map((sellerId) => productsRepository.delete({ sellerId })),
		)
		trackedSellerIds.clear()
	})

	afterAll(async () => {
		await app.close()
	})

	it('creates an active product owned by the authenticated seller', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(
				createPayload({
					name: '  Marketplace product  ',
					description: '  Product created through the API  ',
				}),
			)
			.expect(201)

		expect(Object.keys(response.body).sort()).toEqual(productFields)
		expect(response.body).toMatchObject({
			name: 'Marketplace product',
			description: 'Product created through the API',
			price: 19.99,
			stock: 10,
			sellerId,
			isActive: true,
		})
		expect(response.body.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		)
		expect(Number.isNaN(Date.parse(response.body.createdAt))).toBe(false)
		expect(Number.isNaN(Date.parse(response.body.updatedAt))).toBe(false)
		expect(response.body).not.toHaveProperty('email')
		expect(response.body).not.toHaveProperty('role')
		expect(response.body).not.toHaveProperty('token')

		const savedProduct = await productsRepository.findOneByOrFail({
			id: response.body.id,
		})

		expect(savedProduct).toMatchObject({
			name: 'Marketplace product',
			description: 'Product created through the API',
			stock: 10,
			sellerId,
			isActive: true,
		})
		expect(Number(savedProduct.price)).toBe(19.99)
		expect(await productsRepository.countBy({ sellerId })).toBe(1)
	})

	it('accepts all valid lower and upper boundaries', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(
				createPayload({
					name: 'a'.repeat(255),
					price: 0.01,
					stock: 0,
				}),
			)
			.expect(201)

		expect(response.body).toMatchObject({
			name: 'a'.repeat(255),
			price: 0.01,
			stock: 0,
			sellerId,
			isActive: true,
		})
	})

	it('rejects a buyer before persisting a product', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.BUYER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(createPayload())
			.expect(403)

		expect(response.body).toEqual({
			message: 'Apenas vendedores podem criar produtos',
			error: 'Forbidden',
			statusCode: 403,
		})
		expect(await productsRepository.countBy({ sellerId })).toBe(0)
	})

	it.each([
		['a missing token', undefined],
		['a malformed token', 'Bearer invalid-token'],
	])('rejects %s before persisting a product', async (_label, authorization) => {
		const countBeforeRequest = await productsRepository.count()
		const pendingRequest = request(app.getHttpServer())
			.post('/products')
			.send(createPayload())

		if (authorization) {
			pendingRequest.set('Authorization', authorization)
		}

		await pendingRequest.expect(401)
		expect(await productsRepository.count()).toBe(countBeforeRequest)
	})

	it('rejects an expired token before persisting a product', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER, {
			expiresIn: -1,
		})

		await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(createPayload())
			.expect(401)

		expect(await productsRepository.countBy({ sellerId })).toBe(0)
	})

	it.each([
		['missing name', { name: undefined }, 'name'],
		['empty name', { name: '   ' }, 'name'],
		['long name', { name: 'a'.repeat(256) }, 'name'],
		['missing description', { description: undefined }, 'description'],
		['empty description', { description: '   ' }, 'description'],
		['missing price', { price: undefined }, 'price'],
		['string price', { price: '19.99' }, 'price'],
		['zero price', { price: 0 }, 'price'],
		['negative price', { price: -1 }, 'price'],
		['price with three decimals', { price: 19.999 }, 'price'],
		['missing stock', { stock: undefined }, 'stock'],
		['string stock', { stock: '10' }, 'stock'],
		['negative stock', { stock: -1 }, 'stock'],
		['fractional stock', { stock: 1.5 }, 'stock'],
	])('rejects %s', async (_label, overrides, expectedField) => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(createPayload(overrides))
			.expect(400)

		expect(response.body.statusCode).toBe(400)
		expect(response.body.message).toBe('Validation failed')
		expect(Array.isArray(response.body.errors)).toBe(true)
		expect(
			response.body.errors.some(
				(error: { path?: string[] }) => error.path?.[0] === expectedField,
			),
		).toBe(true)
		expect(await productsRepository.countBy({ sellerId })).toBe(0)
	})

	it('returns every validation error and persists nothing', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send({
				name: '',
				description: '',
				price: 0,
				stock: -1,
			})
			.expect(400)

		const invalidFields = response.body.errors.map(
			(error: { path: string[] }) => error.path[0],
		)

		expect(new Set(invalidFields)).toEqual(
			new Set(['name', 'description', 'price', 'stock']),
		)
		expect(await productsRepository.countBy({ sellerId })).toBe(0)
	})

	it('rejects server-controlled and unknown fields', async () => {
		const { sellerId, authorization } = createAuthorization(UserRole.SELLER)
		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send({
				...createPayload(),
				id: randomUUID(),
				sellerId: randomUUID(),
				isActive: false,
				createdAt: '2026-08-30T00:00:00.000Z',
				updatedAt: '2026-08-30T00:00:00.000Z',
				category: 'not-supported',
			})
			.expect(400)

		expect(
			response.body.errors.some(
				(error: { code: string }) => error.code === 'unrecognized_keys',
			),
		).toBe(true)
		expect(await productsRepository.countBy({ sellerId })).toBe(0)
	})

	it('does not expose out-of-scope product endpoints', async () => {
		const { authorization } = createAuthorization(UserRole.SELLER)
		const productId = randomUUID()

		await request(app.getHttpServer())
			.get('/products')
			.set('Authorization', authorization)
			.expect(404)
		await request(app.getHttpServer())
			.patch(`/products/${productId}`)
			.set('Authorization', authorization)
			.send({ name: 'Updated product' })
			.expect(404)
		await request(app.getHttpServer())
			.delete(`/products/${productId}`)
			.set('Authorization', authorization)
			.expect(404)
	})
})
