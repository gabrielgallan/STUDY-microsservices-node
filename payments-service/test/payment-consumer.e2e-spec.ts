import { PaymentConsumerService } from '../src/events/payment-consumer/payment-consumer.service'
import type { PaymentOrderMessage } from '../src/events/payment-queue/payment-queue.interface'
import type { PaymentsQueueService } from '../src/events/payment-queue/payments-queue.service'
import type { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'
import { type Payment, PaymentStatus } from '../src/payments/entities/payment.entity'
import type { PaymentsService } from '../src/payments/payments.service'

const publishedMessage = (): PaymentOrderMessage => ({
	orderId: '20dcbb35-2685-4547-a7b0-2929b720589a',
	userId: '07ad3bed-9b52-4ec0-a79f-70b2a55c290c',
	amount: 100,
	items: [
		{
			productId: '9884e844-1496-4cb8-8d73-a9dbce564f61',
			quantity: 1,
			price: 100,
		},
	],
	paymentMethod: 'pix',
	createdAt: '2026-08-30T20:00:00.000Z',
	metadata: {
		service: 'checkout-service',
		timestamp: '2026-08-30T20:00:01.000Z',
	},
})

const processedPayment = (status: PaymentStatus): Payment =>
	({
		id: 'a2e1b7a4-1b52-4d0f-9a6f-2fbb2f0f5d31',
		orderId: publishedMessage().orderId,
		status,
	}) as Payment

describe('PaymentConsumerService contract boundary', () => {
	let service: PaymentConsumerService
	let consumeCallback: (message: PaymentOrderMessage) => Promise<void>
	let processPayment: jest.Mock

	beforeEach(async () => {
		const paymentsQueueService = {
			consumePaymentOrder: jest.fn(
				async (callback: (message: PaymentOrderMessage) => Promise<void>) => {
					consumeCallback = callback
				},
			),
		} as unknown as PaymentsQueueService
		const rabbitmqService = {
			waitForConnection: jest.fn().mockResolvedValue(true),
		} as unknown as RabbitmqService

		processPayment = jest
			.fn()
			.mockResolvedValue(processedPayment(PaymentStatus.APPROVED))
		const paymentsService = { processPayment } as unknown as PaymentsService

		service = new PaymentConsumerService(
			paymentsQueueService,
			rabbitmqService,
			paymentsService,
		)
		await service.startConsuming()
	})

	it('counts a fully valid published message as success', async () => {
		await expect(consumeCallback(publishedMessage())).resolves.toBeUndefined()

		expect(service.getMetrics()).toMatchObject({
			totalProcessed: 1,
			totalSuccess: 1,
			totalFailed: 0,
		})
	})

	it('hands the validated message over to the payments service', async () => {
		await consumeCallback(publishedMessage())

		expect(processPayment).toHaveBeenCalledTimes(1)
		expect(processPayment).toHaveBeenCalledWith(
			expect.objectContaining({
				orderId: publishedMessage().orderId,
				userId: publishedMessage().userId,
				amount: 100,
				paymentMethod: 'pix',
			}),
		)
	})

	it('treats a rejected payment as a successful processing', async () => {
		processPayment.mockResolvedValue(processedPayment(PaymentStatus.REJECTED))

		await expect(consumeCallback(publishedMessage())).resolves.toBeUndefined()

		expect(service.getMetrics()).toMatchObject({
			totalProcessed: 1,
			totalSuccess: 1,
			totalFailed: 0,
		})
	})

	it('propagates a technical failure for the RabbitMQ retry flow', async () => {
		processPayment.mockRejectedValue(new Error('database is unavailable'))

		await expect(consumeCallback(publishedMessage())).rejects.toThrow(
			'database is unavailable',
		)

		expect(service.getMetrics()).toMatchObject({
			totalProcessed: 1,
			totalSuccess: 0,
			totalFailed: 1,
		})
	})

	it.each([
		{ ...publishedMessage(), orderId: 'not-a-uuid' },
		{ ...publishedMessage(), metadata: undefined },
		{
			...publishedMessage(),
			items: [{ ...publishedMessage().items[0], quantity: 1.5 }],
		},
	])('rejects an invalid message for the RabbitMQ failure flow', async (message) => {
		await expect(
			consumeCallback(message as PaymentOrderMessage),
		).rejects.toThrow('Invalid payment message')

		expect(service.getMetrics()).toMatchObject({
			totalProcessed: 1,
			totalSuccess: 0,
			totalFailed: 1,
		})
		expect(processPayment).not.toHaveBeenCalled()
	})
})
