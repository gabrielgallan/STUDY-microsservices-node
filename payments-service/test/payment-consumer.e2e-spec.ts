import { PaymentConsumerService } from '../src/events/payment-consumer/payment-consumer.service'
import type { PaymentOrderMessage } from '../src/events/payment-queue/payment-queue.interface'
import type { PaymentsQueueService } from '../src/events/payment-queue/payments-queue.service'
import type { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'

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

describe('PaymentConsumerService contract boundary', () => {
	let service: PaymentConsumerService
	let consumeCallback: (message: PaymentOrderMessage) => Promise<void>

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

		service = new PaymentConsumerService(
			paymentsQueueService,
			rabbitmqService,
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
	})
})
