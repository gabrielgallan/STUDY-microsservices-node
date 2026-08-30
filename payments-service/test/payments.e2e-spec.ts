import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { In, type Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import type { PaymentOrderMessage } from '../src/events/payment-queue/payment-queue.interface'
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity'
import {
	CARD_DECLINED_REASON,
	FakePaymentGatewayService,
	LIMIT_EXCEEDED_REASON,
} from '../src/payments/fake-payment-gateway.service'
import { PaymentsService } from '../src/payments/payments.service'

/** Keeps the suite fast: the simulated gateway latency is not exercised here. */
class InstantFakePaymentGatewayService extends FakePaymentGatewayService {
	protected sleep(): Promise<void> {
		return Promise.resolve()
	}
}

describe('Payment processing (e2e)', () => {
	let app: INestApplication
	let baseUrl: string
	let paymentsService: PaymentsService
	let paymentsRepository: Repository<Payment>
	let gateway: FakePaymentGatewayService
	const orderIds = new Set<string>()

	const httpGet = async (path: string) => {
		const response = await fetch(`${baseUrl}${path}`)
		const text = await response.text()

		return {
			status: response.status,
			body: text ? JSON.parse(text) : undefined,
		}
	}

	const orderMessage = (
		overrides: Partial<PaymentOrderMessage> = {},
	): PaymentOrderMessage => {
		const orderId = overrides.orderId ?? randomUUID()
		orderIds.add(orderId)

		return {
			userId: randomUUID(),
			amount: 100,
			items: [{ productId: randomUUID(), quantity: 1, price: 100 }],
			paymentMethod: 'pix',
			createdAt: new Date().toISOString(),
			metadata: {
				service: 'checkout-service',
				timestamp: new Date().toISOString(),
			},
			...overrides,
			orderId,
		}
	}

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(RabbitmqService)
			.useValue({
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
				// The consumer gives up subscribing, so no broker is needed.
				waitForConnection: jest.fn().mockResolvedValue(false),
				publishMessage: jest.fn(),
				getChannel: jest.fn(),
			})
			.overrideProvider(FakePaymentGatewayService)
			.useClass(InstantFakePaymentGatewayService)
			.compile()

		app = testingModule.createNestApplication()
		await app.listen(0)

		const { port } = app.getHttpServer().address() as AddressInfo
		baseUrl = `http://127.0.0.1:${port}`

		paymentsService = app.get(PaymentsService)
		paymentsRepository = app.get(getRepositoryToken(Payment))
		gateway = app.get(FakePaymentGatewayService)
	})

	afterAll(async () => {
		if (orderIds.size > 0) {
			await paymentsRepository.delete({ orderId: In([...orderIds]) })
		}
		await app.close()
	})

	describe('processing', () => {
		it('persists an approved payment with the message data', async () => {
			const message = orderMessage({ amount: 250.5 })

			const payment = await paymentsService.processPayment(message)

			expect(payment).toMatchObject({
				orderId: message.orderId,
				userId: message.userId,
				paymentMethod: 'pix',
				status: PaymentStatus.APPROVED,
			})
			expect(Number(payment.amount)).toBe(250.5)
			expect(payment.transactionId).toEqual(expect.any(String))
			expect(payment.rejectionReason).toBeNull()
			expect(payment.processedAt).toBeInstanceOf(Date)

			const stored = await paymentsRepository.findOneByOrFail({
				orderId: message.orderId,
			})
			expect(stored.status).toBe(PaymentStatus.APPROVED)
		})

		it('persists a payment rejected for exceeding the limit', async () => {
			const payment = await paymentsService.processPayment(
				orderMessage({ amount: 15000 }),
			)

			expect(payment.status).toBe(PaymentStatus.REJECTED)
			expect(payment.rejectionReason).toBe(LIMIT_EXCEEDED_REASON)
			expect(payment.transactionId).toEqual(expect.any(String))
			expect(payment.processedAt).toBeInstanceOf(Date)
		})

		it('persists a payment rejected by the card operator', async () => {
			const payment = await paymentsService.processPayment(
				orderMessage({ amount: 49.99 }),
			)

			expect(payment.status).toBe(PaymentStatus.REJECTED)
			expect(payment.rejectionReason).toBe(CARD_DECLINED_REASON)
		})

		it('never leaves a processed payment pending', async () => {
			await paymentsService.processPayment(orderMessage({ amount: 10 }))
			await paymentsService.processPayment(orderMessage({ amount: 20000 }))

			const pending = await paymentsRepository.countBy({
				orderId: In([...orderIds]),
				status: PaymentStatus.PENDING,
			})
			expect(pending).toBe(0)
		})

		it('is idempotent per order and does not charge twice', async () => {
			const message = orderMessage({ amount: 77.5 })
			const charge = jest.spyOn(gateway, 'charge')

			const first = await paymentsService.processPayment(message)
			const callsAfterFirst = charge.mock.calls.length
			const second = await paymentsService.processPayment(message)

			expect(second.id).toBe(first.id)
			expect(second.status).toBe(first.status)
			expect(second.transactionId).toBe(first.transactionId)
			expect(charge.mock.calls).toHaveLength(callsAfterFirst)
			await expect(
				paymentsRepository.countBy({ orderId: message.orderId }),
			).resolves.toBe(1)

			charge.mockRestore()
		})

		it('keeps one payment per order at the database level', async () => {
			const message = orderMessage({ amount: 33 })
			await paymentsService.processPayment(message)

			await expect(
				paymentsRepository.save(
					paymentsRepository.create({
						orderId: message.orderId,
						userId: randomUUID(),
						amount: 33,
						paymentMethod: 'pix',
					}),
				),
			).rejects.toThrow()
		})
	})

	describe('GET /payments/:orderId', () => {
		it('returns the payment of an order', async () => {
			const message = orderMessage({ amount: 120.35 })
			const payment = await paymentsService.processPayment(message)

			const response = await httpGet(`/payments/${message.orderId}`)

			expect(response.status).toBe(200)
			expect(response.body).toMatchObject({
				id: payment.id,
				orderId: message.orderId,
				userId: message.userId,
				amount: 120.35,
				status: PaymentStatus.APPROVED,
				paymentMethod: 'pix',
			})
			expect(typeof response.body.amount).toBe('number')
			expect(response.body.transactionId).toEqual(expect.any(String))
			expect(response.body.rejectionReason).toBeNull()
			expect(response.body.processedAt).toEqual(expect.any(String))
		})

		it('exposes the rejection reason of a rejected payment', async () => {
			const message = orderMessage({ amount: 1999.99 })
			await paymentsService.processPayment(message)

			const response = await httpGet(`/payments/${message.orderId}`)

			expect(response.status).toBe(200)
			expect(response.body).toMatchObject({
				status: PaymentStatus.REJECTED,
				rejectionReason: CARD_DECLINED_REASON,
			})
		})

		it('answers 400 for an orderId that is not a UUID', async () => {
			const response = await httpGet('/payments/not-a-uuid')

			expect(response.status).toBe(400)
		})

		it('answers 404 for an order without payment', async () => {
			const response = await httpGet(`/payments/${randomUUID()}`)

			expect(response.status).toBe(404)
		})
	})

	describe('service endpoints', () => {
		it('answers the service health check', async () => {
			const response = await httpGet('/health')

			expect(response.status).toBe(200)
			expect(response.body).toEqual({
				status: 'ok',
				service: 'payments-service',
			})
		})

		it('keeps the consumer metrics endpoints untouched', async () => {
			const metrics = await httpGet('/metrics')
			expect(metrics.status).toBe(200)
			expect(metrics.body).toMatchObject({
				totalProcessed: expect.any(Number),
				status: 'active',
			})

			const health = await httpGet('/metrics/health')
			expect(health.status).toBe(200)
			expect(health.body).toMatchObject({
				status: expect.any(String),
				checks: expect.any(Object),
			})

			const summary = await httpGet('/metrics/summary')
			expect(summary.status).toBe(200)
		})

		/**
		 * Without a broker the DLQ routes answer their own 500 by design, so what
		 * is verifiable here is that they are still mounted and were not replaced.
		 */
		it('keeps the dlq routes mounted', async () => {
			const stats = await httpGet('/dlq/stats')
			const messages = await httpGet('/dlq/messages')

			expect(stats.status).not.toBe(404)
			expect(messages.status).not.toBe(404)
		})
	})
})
