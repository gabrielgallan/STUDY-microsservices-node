import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import type { Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator'
import { Product } from '../src/products/entities/product.entity'
import { ProductsController } from '../src/products/products.controller'

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

describe('Product queries', () => {
	let app: INestApplication
	let productsRepository: Repository<Product>
	const trackedProductIds = new Set<string>()

	const createProduct = async ({
		label,
		sellerId = randomUUID(),
		isActive = true,
		createdAt,
	}: {
		label: string
		sellerId?: string
		isActive?: boolean
		createdAt?: Date
	}) => {
		const product = await productsRepository.save(
			productsRepository.create({
				name: `Product ${label}`,
				description: `Description ${label}`,
				price: 19.99,
				stock: 10,
				sellerId,
				isActive,
				createdAt,
			}),
		)

		trackedProductIds.add(product.id)

		return product
	}

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()

		productsRepository = app.get<Repository<Product>>(getRepositoryToken(Product))
	})

	afterEach(async () => {
		await Promise.all(
			[...trackedProductIds].map((id) => productsRepository.delete({ id })),
		)
		trackedProductIds.clear()
	})

	afterAll(async () => {
		await app.close()
	})

	describe('GET /products', () => {
		it('returns an empty list when there are no active products', async () => {
			const response = await request(app.getHttpServer()).get('/products').expect(200)

			expect(response.body).toEqual([])
		})

		it('returns only active products from newest to oldest', async () => {
			const oldest = await createProduct({
				label: 'oldest',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
			})
			const newest = await createProduct({
				label: 'newest',
				createdAt: new Date('2026-03-01T00:00:00.000Z'),
			})
			const middle = await createProduct({
				label: 'middle',
				createdAt: new Date('2026-02-01T00:00:00.000Z'),
			})
			const inactive = await createProduct({
				label: 'inactive',
				isActive: false,
				createdAt: new Date('2026-04-01T00:00:00.000Z'),
			})

			const response = await request(app.getHttpServer()).get('/products').expect(200)

			expect(response.body.map((product: Product) => product.id)).toEqual([
				newest.id,
				middle.id,
				oldest.id,
			])
			expect(response.body.map((product: Product) => product.id)).not.toContain(
				inactive.id,
			)

			for (const product of response.body) {
				expect(Object.keys(product).sort()).toEqual(productFields)
				expect(product.isActive).toBe(true)
			}
		})
	})

	describe('GET /products/seller/:sellerId', () => {
		it('returns all and only active products from the requested seller', async () => {
			const sellerId = randomUUID()
			const firstActive = await createProduct({ label: 'seller-first', sellerId })
			const secondActive = await createProduct({ label: 'seller-second', sellerId })
			const inactive = await createProduct({
				label: 'seller-inactive',
				sellerId,
				isActive: false,
			})
			const otherSeller = await createProduct({ label: 'other-seller' })

			const response = await request(app.getHttpServer())
				.get(`/products/seller/${sellerId}`)
				.expect(200)
			const returnedIds = response.body.map((product: Product) => product.id)

			expect(returnedIds).toEqual(
				expect.arrayContaining([firstActive.id, secondActive.id]),
			)
			expect(returnedIds).toHaveLength(2)
			expect(returnedIds).not.toContain(inactive.id)
			expect(returnedIds).not.toContain(otherSeller.id)

			for (const product of response.body) {
				expect(Object.keys(product).sort()).toEqual(productFields)
				expect(product).toMatchObject({ sellerId, isActive: true })
			}
		})

		it('returns an empty list when the seller has no active products', async () => {
			const response = await request(app.getHttpServer())
				.get(`/products/seller/${randomUUID()}`)
				.expect(200)

			expect(response.body).toEqual([])
		})
	})

	describe('GET /products/:id', () => {
		it.each([true, false])(
			'returns an existing product when isActive is %s',
			async (isActive) => {
				const product = await createProduct({
					label: `lookup-${isActive}`,
					isActive,
				})

				const response = await request(app.getHttpServer())
					.get(`/products/${product.id}`)
					.expect(200)

				expect(Object.keys(response.body).sort()).toEqual(productFields)
				expect(response.body).toMatchObject({
					id: product.id,
					sellerId: product.sellerId,
					isActive,
				})
			},
		)

		it('returns 404 with a stable message for an unknown UUID', async () => {
			const response = await request(app.getHttpServer())
				.get(`/products/${randomUUID()}`)
				.expect(404)

			expect(response.body).toMatchObject({
				message: 'Produto não encontrado',
				statusCode: 404,
			})
		})

		it('returns 400 for a malformed UUID', async () => {
			const response = await request(app.getHttpServer())
				.get('/products/not-a-uuid')
				.expect(400)

			expect(response.body.statusCode).toBe(400)
			expect(response.body.message).toContain('uuid')
		})
	})

	describe('public access and route resolution', () => {
		it('allows every query route without a token and with an invalid token', async () => {
			const product = await createProduct({ label: 'public-access' })
			const paths = [
				'/products',
				`/products/seller/${product.sellerId}`,
				`/products/${product.id}`,
			]

			for (const path of paths) {
				await request(app.getHttpServer()).get(path).expect(200)
				await request(app.getHttpServer())
					.get(path)
					.set('Authorization', 'Bearer invalid-token')
					.expect(200)
			}
		})

		it.each(['findAllActive', 'findActiveBySeller', 'findById'] as const)(
			'marks ProductsController.%s as public',
			(handler) => {
				expect(
					Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController.prototype[handler]),
				).toBe(true)
			},
		)

		it('keeps product creation protected', () => {
			expect(
				Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController.prototype.create),
			).toBeUndefined()
		})
	})
})
