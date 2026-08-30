import { randomUUID } from 'node:crypto'
import {
	type CanActivate,
	type ExecutionContext,
	HttpException,
	type INestApplication,
} from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import type { UserPayload } from '../src/auth/strategies/jwt.strategy'
import { ProxyService } from '../src/proxy/service/proxy.service'

const identity: UserPayload = {
	userId: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
	email: 'buyer@example.invalid',
	role: 'buyer',
}

const AUTHORIZATION = 'Bearer gateway-payments-routing-token'

class AuthenticatedGuardFixture implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		context.switchToHttp().getRequest().user = identity

		return true
	}
}

describe('Gateway payments-service routing', () => {
	let app: INestApplication
	const proxyRequest = jest.fn()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ProxyService)
			.useValue({ proxyRequest })
			.overrideGuard(JwtAuthGuard)
			.useClass(AuthenticatedGuardFixture)
			.compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()
	})

	beforeEach(() => {
		proxyRequest.mockReset()
		proxyRequest.mockResolvedValue({})
	})

	afterAll(async () => {
		await app.close()
	})

	it('forwards GET /payments/:orderId preserving the order id', async () => {
		const orderId = randomUUID()
		const payment = { id: randomUUID(), orderId, status: 'approved', amount: 99.8 }
		proxyRequest.mockResolvedValue(payment)

		await request(app.getHttpServer())
			.get(`/payments/${orderId}`)
			.set('Authorization', AUTHORIZATION)
			.expect(200, payment)

		expect(proxyRequest).toHaveBeenCalledWith(
			'payments',
			'get',
			`/payments/${orderId}`,
			undefined,
			{ Authorization: AUTHORIZATION },
			identity,
		)
	})

	it('forwards an identifier that is not a UUID instead of rejecting it', async () => {
		await request(app.getHttpServer())
			.get('/payments/not-a-uuid')
			.set('Authorization', AUTHORIZATION)
			.expect(200)

		expect(proxyRequest).toHaveBeenCalledWith(
			'payments',
			'get',
			'/payments/not-a-uuid',
			undefined,
			{ Authorization: AUTHORIZATION },
			identity,
		)
	})

	it.each([400, 404])(
		'preserves the %s answered by the payments-service',
		async (status) => {
			const body = { statusCode: status, message: `Downstream ${status}` }
			proxyRequest.mockRejectedValue(new HttpException(body, status))

			await request(app.getHttpServer())
				.get(`/payments/${randomUUID()}`)
				.set('Authorization', AUTHORIZATION)
				.expect(status, body)
		},
	)

	it('does not expose dlq or metrics routes of the payments-service', async () => {
		await request(app.getHttpServer())
			.get('/dlq/stats')
			.set('Authorization', AUTHORIZATION)
			.expect(404)
		await request(app.getHttpServer())
			.get('/metrics')
			.set('Authorization', AUTHORIZATION)
			.expect(404)
	})
})

describe('Gateway payments route without authentication', () => {
	let app: INestApplication
	const proxyRequest = jest.fn()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(ProxyService)
			.useValue({ proxyRequest })
			.compile()

		app = testingModule.createNestApplication()
		app.useGlobalPipes(new ZodValidationPipe())
		await app.init()
	})

	beforeEach(() => {
		proxyRequest.mockReset()
	})

	afterAll(async () => {
		await app.close()
	})

	it('answers 401 without a token and never reaches the proxy', async () => {
		await request(app.getHttpServer()).get(`/payments/${randomUUID()}`).expect(401)

		expect(proxyRequest).not.toHaveBeenCalled()
	})

	it('answers 401 when the token is invalid', async () => {
		await request(app.getHttpServer())
			.get(`/payments/${randomUUID()}`)
			.set('Authorization', 'Bearer invalid-token')
			.expect(401)

		expect(proxyRequest).not.toHaveBeenCalled()
	})
})
