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

const AUTHORIZATION = 'Bearer gateway-checkout-routing-token'

class AuthenticatedGuardFixture implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		context.switchToHttp().getRequest().user = identity

		return true
	}
}

describe('Gateway checkout-service routing', () => {
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

	describe('cart routes', () => {
		it('forwards POST /cart/items with the untouched body', async () => {
			const body = { productId: randomUUID(), quantity: 3 }
			const cart = { id: randomUUID(), items: [], total: 0 }
			proxyRequest.mockResolvedValue(cart)

			await request(app.getHttpServer())
				.post('/cart/items')
				.set('Authorization', AUTHORIZATION)
				.send(body)
				.expect(201, cart)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'post',
				'/cart/items',
				body,
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('forwards GET /cart', async () => {
			const cart = { id: null, items: [], total: 0 }
			proxyRequest.mockResolvedValue(cart)

			await request(app.getHttpServer())
				.get('/cart')
				.set('Authorization', AUTHORIZATION)
				.expect(200, cart)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'get',
				'/cart',
				undefined,
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('forwards DELETE /cart/items/:itemId preserving the item id', async () => {
			const itemId = randomUUID()

			await request(app.getHttpServer())
				.delete(`/cart/items/${itemId}`)
				.set('Authorization', AUTHORIZATION)
				.expect(200)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'delete',
				`/cart/items/${itemId}`,
				undefined,
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})
	})

	describe('order routes', () => {
		it('forwards POST /cart/checkout with the untouched body', async () => {
			const order = { id: randomUUID(), status: 'pending' }
			proxyRequest.mockResolvedValue(order)

			await request(app.getHttpServer())
				.post('/cart/checkout')
				.set('Authorization', AUTHORIZATION)
				.send({ paymentMethod: 'pix' })
				.expect(201, order)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'post',
				'/cart/checkout',
				{ paymentMethod: 'pix' },
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('forwards an invalid payment method instead of rejecting it', async () => {
			await request(app.getHttpServer())
				.post('/cart/checkout')
				.set('Authorization', AUTHORIZATION)
				.send({ paymentMethod: 'bitcoin' })
				.expect(201)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'post',
				'/cart/checkout',
				{ paymentMethod: 'bitcoin' },
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('forwards GET /orders', async () => {
			proxyRequest.mockResolvedValue([])

			await request(app.getHttpServer())
				.get('/orders')
				.set('Authorization', AUTHORIZATION)
				.expect(200, [])

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'get',
				'/orders',
				undefined,
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('forwards GET /orders/:id preserving the id', async () => {
			const id = randomUUID()

			await request(app.getHttpServer())
				.get(`/orders/${id}`)
				.set('Authorization', AUTHORIZATION)
				.expect(200)

			expect(proxyRequest).toHaveBeenCalledWith(
				'checkout',
				'get',
				`/orders/${id}`,
				undefined,
				{ Authorization: AUTHORIZATION },
				identity,
			)
		})

		it('keeps /cart/items and /cart/checkout resolving independently', async () => {
			await request(app.getHttpServer())
				.post('/cart/items')
				.set('Authorization', AUTHORIZATION)
				.send({ productId: randomUUID(), quantity: 1 })
				.expect(201)
			await request(app.getHttpServer())
				.post('/cart/checkout')
				.set('Authorization', AUTHORIZATION)
				.send({ paymentMethod: 'pix' })
				.expect(201)

			expect(proxyRequest.mock.calls.map((call) => call[2])).toEqual([
				'/cart/items',
				'/cart/checkout',
			])
		})
	})

	describe('downstream errors', () => {
		it.each([400, 404, 422])(
			'preserves the %s answered by the checkout-service',
			async (status) => {
				const body = { statusCode: status, message: `Downstream ${status}` }
				proxyRequest.mockRejectedValue(new HttpException(body, status))

				await request(app.getHttpServer())
					.get('/cart')
					.set('Authorization', AUTHORIZATION)
					.expect(status, body)
			},
		)
	})
})

describe('Gateway checkout routes without authentication', () => {
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

	it.each([
		['post', '/cart/items'],
		['get', '/cart'],
		['delete', `/cart/items/${randomUUID()}`],
		['post', '/cart/checkout'],
		['get', '/orders'],
		['get', `/orders/${randomUUID()}`],
	])('answers 401 on %s %s without reaching the proxy', async (method, path) => {
		const server = app.getHttpServer()

		if (method === 'post') {
			await request(server).post(path).send({}).expect(401)
		} else if (method === 'get') {
			await request(server).get(path).expect(401)
		} else {
			await request(server).delete(path).expect(401)
		}

		expect(proxyRequest).not.toHaveBeenCalled()
	})

	it('answers 401 when the token is invalid', async () => {
		await request(app.getHttpServer())
			.get('/cart')
			.set('Authorization', 'Bearer invalid-token')
			.expect(401)

		expect(proxyRequest).not.toHaveBeenCalled()
	})
})
