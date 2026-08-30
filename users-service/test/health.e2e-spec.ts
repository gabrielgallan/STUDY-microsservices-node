import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'

describe('GET /health', () => {
	let app: INestApplication

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()
	})

	afterAll(async () => {
		await app.close()
	})

	it.each([
		['without authorization', undefined],
		['with an invalid token', 'Bearer invalid-token'],
	])('is public %s and returns the stable service contract', async (_case, token) => {
		const pendingRequest = request(app.getHttpServer()).get('/health')

		if (token) {
			pendingRequest.set('Authorization', token)
		}

		const response = await pendingRequest.expect(200)

		expect(response.body).toEqual({
			status: 'ok',
			service: 'users-service',
		})
		expect(Object.keys(response.body).sort()).toEqual(['service', 'status'])
	})
})
