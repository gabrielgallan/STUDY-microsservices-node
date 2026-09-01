import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import request from 'supertest'
import { DataSource, type Repository } from 'typeorm'
import type { PostgresDriver } from 'typeorm/driver/postgres/PostgresDriver'
import { AppModule } from '../src/app.module'
import { envSchema } from '../src/env/env'
import { Product } from '../src/products/entities/product.entity'

describe('Products service scaffold (e2e)', () => {
	let app: INestApplication
	let dataSource: DataSource
	let productRepository: Repository<Product>
	let createdProductId: string | undefined

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		await app.init()

		dataSource = app.get(DataSource)
		productRepository = app.get(getRepositoryToken(Product))
	})

	afterAll(async () => {
		if (createdProductId) {
			await productRepository.delete(createdProductId)
		}

		await app.close()
	})

	it('connects to the products database', () => {
		expect(dataSource.isInitialized).toBe(true)
		expect(dataSource.options.type).toBe('postgres')
		expect((dataSource.driver as PostgresDriver).database).toBe('products')
	})

	it('does not expose HTTP endpoints', async () => {
		await request(app.getHttpServer()).get('/').expect(404)
	})

	it('maps exactly the specified product columns', () => {
		const metadata = productRepository.metadata
		const columns = Object.fromEntries(
			metadata.columns.map((column) => [column.propertyName, column]),
		)

		expect(metadata.tableName).toBe('products')
		expect(Object.keys(columns)).toEqual([
			'id',
			'name',
			'description',
			'price',
			'stock',
			'sellerId',
			'isActive',
			'createdAt',
			'updatedAt',
		])

		expect(columns.id.type).toBe('uuid')
		expect(columns.id.isPrimary).toBe(true)
		expect(columns.id.isGenerated).toBe(true)
		expect(columns.id.generationStrategy).toBe('uuid')
		expect(columns.name.type).toBe('varchar')
		expect(columns.name.length).toBe('255')
		expect(columns.description.type).toBe('text')
		expect(columns.price.type).toBe('decimal')
		expect(columns.price.precision).toBe(10)
		expect(columns.price.scale).toBe(2)
		expect(columns.stock.type).toBe('int')
		expect(columns.stock.default).toBe(0)
		expect(columns.sellerId.type).toBe('uuid')
		expect(columns.isActive.type).toBe('boolean')
		expect(columns.isActive.default).toBe(true)
		expect(columns.createdAt.type).toBe('timestamp')
		expect(columns.createdAt.isCreateDate).toBe(true)
		expect(columns.updatedAt.type).toBe('timestamp')
		expect(columns.updatedAt.isUpdateDate).toBe(true)
		expect(metadata.relations).toHaveLength(0)
		expect(metadata.foreignKeys).toHaveLength(0)
	})

	it('persists automatic values and defaults', async () => {
		const product = await productRepository.save(
			productRepository.create({
				name: 'Scaffold product',
				description: 'Product created by the scaffold e2e test',
				price: 99.9,
				sellerId: randomUUID(),
			}),
		)

		createdProductId = product.id

		expect(product.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		)
		expect(product.stock).toBe(0)
		expect(product.isActive).toBe(true)
		expect(product.createdAt).toBeInstanceOf(Date)
		expect(product.updatedAt).toBeInstanceOf(Date)
	})
})

describe('Environment schema', () => {
	it('provides the local defaults', () => {
		expect(envSchema.parse({ JWT_SECRET: 'products-service-e2e-secret' })).toEqual({
			NODE_ENV: 'production',
			PORT: 3002,
			DATABASE_URL: 'postgresql://docker:docker@localhost:5436/products',
			JWT_SECRET: 'products-service-e2e-secret',
		})
	})

	it('accepts valid overrides and coerces ports', () => {
		expect(
			envSchema.parse({
				NODE_ENV: 'development',
				PORT: '3102',
				DATABASE_URL:
					'postgresql://products-user:products-password@database:6436/products-development',
				JWT_SECRET: 'products-service-development-secret',
			}),
		).toEqual({
			NODE_ENV: 'development',
			PORT: 3102,
			DATABASE_URL:
				'postgresql://products-user:products-password@database:6436/products-development',
			JWT_SECRET: 'products-service-development-secret',
		})
	})

	it('requires the shared JWT secret', () => {
		expect(envSchema.safeParse({}).success).toBe(false)
	})

	it.each([
		['NODE_ENV', 'staging'],
		['PORT', '0'],
		['PORT', '65536'],
		['PORT', 'invalid'],
		['DATABASE_URL', 'not-a-url'],
		['DATABASE_URL', '  '],
		['JWT_SECRET', '  '],
	])('rejects an invalid %s value', (key, value) => {
		expect(
			envSchema.safeParse({
				JWT_SECRET: 'products-service-e2e-secret',
				[key]: value,
			}).success,
		).toBe(false)
	})
})
