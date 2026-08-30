import { randomUUID } from 'node:crypto'
import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { ZodValidationPipe } from 'nestjs-zod'
import request from 'supertest'
import { AppModule } from '../src/app.module'
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import type { UserPayload } from '../src/auth/strategies/jwt.strategy'
import { ProductsController } from '../src/products/products.controller'
import { ProxyService } from '../src/proxy/service/proxy.service'

const identity: UserPayload = {
	userId: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
	email: 'seller@example.invalid',
	role: 'seller',
}

class AuthenticatedGuardFixture implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		context.switchToHttp().getRequest().user = identity

		return true
	}
}

describe('Gateway products-service routing', () => {
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
	})

	afterAll(async () => {
		await app.close()
	})

	it.each([
		['catalog', '/products', '/products', []],
		[
			'seller products',
			`/products/seller/${identity.userId}`,
			`/products/seller/${identity.userId}`,
			[],
		],
		[
			'product by ID',
			'/products/6d45939e-0529-4cb6-b63a-f73271feb506',
			'/products/6d45939e-0529-4cb6-b63a-f73271feb506',
			{ id: '6d45939e-0529-4cb6-b63a-f73271feb506' },
		],
	])(
		'forwards GET %s to the products-service contract',
		async (_label, publicPath, servicePath, serviceResponse) => {
			proxyRequest.mockResolvedValueOnce(serviceResponse)

			const response = await request(app.getHttpServer()).get(publicPath).expect(200)

			expect(response.body).toEqual(serviceResponse)
			expect(proxyRequest).toHaveBeenCalledWith('products', 'get', servicePath)
		},
	)

	it('forwards POST /products with the original body and Bearer header', async () => {
		const authorization = 'Bearer original-jwt'
		const payload = {
			name: 'Gateway product',
			description: 'Created through the gateway',
			price: 29.99,
			stock: 5,
		}
		const product = { id: randomUUID(), ...payload, sellerId: identity.userId }
		proxyRequest.mockResolvedValueOnce(product)

		const response = await request(app.getHttpServer())
			.post('/products')
			.set('Authorization', authorization)
			.send(payload)
			.expect(201)

		expect(response.body).toEqual(product)
		expect(proxyRequest).toHaveBeenCalledWith(
			'products',
			'post',
			'/products',
			payload,
			{ Authorization: authorization },
			identity,
		)
	})

	it.each(['findAllActive', 'findActiveBySeller', 'findById'] as const)(
		'marks ProductsController.%s as public',
		(handler) => {
			expect(
				Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController.prototype[handler]),
			).toBe(true)
		},
	)

	it('keeps ProductsController.create protected', () => {
		expect(
			Reflect.getMetadata(IS_PUBLIC_KEY, ProductsController.prototype.create),
		).toBeUndefined()
	})
})

describe('Gateway products route protection', () => {
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
		proxyRequest.mockResolvedValue([])
	})

	afterAll(async () => {
		await app.close()
	})

	it.each([
		'/products',
		`/products/seller/${randomUUID()}`,
		`/products/${randomUUID()}`,
	])('allows public GET %s without a valid token', async (path) => {
		await request(app.getHttpServer()).get(path).expect(200)
		await request(app.getHttpServer())
			.get(path)
			.set('Authorization', 'Bearer invalid-token')
			.expect(200)
	})

	it.each([undefined, 'Bearer invalid-token'])(
		'rejects POST /products with authorization %s',
		async (authorization) => {
			const pendingRequest = request(app.getHttpServer()).post('/products').send({})

			if (authorization) {
				pendingRequest.set('Authorization', authorization)
			}

			await pendingRequest.expect(401)
			expect(proxyRequest).not.toHaveBeenCalled()
		},
	)
})
