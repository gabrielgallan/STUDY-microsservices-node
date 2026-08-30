import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { configureSwagger } from '../src/config/swagger.config'

describe('Products Service OpenAPI', () => {
	let app: INestApplication

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		configureSwagger(app)
		await app.init()
	})

	afterAll(async () => {
		await app.close()
	})

	it('serves the public Swagger UI at /api', async () => {
		const response = await request(app.getHttpServer()).get('/api').expect(200)

		expect(response.headers['content-type']).toContain('text/html')
		expect(response.text).toContain('Swagger UI')
	})

	it('publishes the service metadata, bearer scheme and product routes', async () => {
		const response = await request(app.getHttpServer()).get('/api-json').expect(200)
		const document = response.body

		expect(document.info).toMatchObject({
			title: 'Products Service',
			version: '1.0',
		})
		expect(document.components.securitySchemes.bearer).toEqual({
			type: 'http',
			scheme: 'bearer',
			bearerFormat: 'JWT',
		})
		expect(Object.keys(document.paths)).toEqual(
			expect.arrayContaining([
				'/health',
				'/products',
				'/products/seller/{sellerId}',
				'/products/{id}',
			]),
		)
		expect(document.paths['/products'].post.security).toEqual([{ bearer: [] }])
		expect(document.paths['/products'].get.security).toBeUndefined()
		expect(document.paths['/products/{id}'].get.security).toBeUndefined()
		expect(document.paths['/health'].get.security).toBeUndefined()
	})
})
