import type { Cart } from '../src/cart/entities/cart.entity'
import { toPaymentOrderMessage } from '../src/events/payment-queue/payment-order-message.mapper'
import type { PaymentOrderMessage } from '../src/events/payment-queue/payment-queue.interface'
import { PaymentsQueueService } from '../src/events/payment-queue/payments-queue.service'
import type { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'
import type { Order } from '../src/orders/entities/order.entity'

const validMessage = (): PaymentOrderMessage => ({
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
	paymentMethod: 'credit_card',
})

describe('PaymentsQueueService', () => {
	const publishMessage = jest.fn<Promise<void>, [string, string, unknown]>()
	const service = new PaymentsQueueService({
		publishMessage,
	} as unknown as RabbitmqService)

	beforeEach(() => {
		publishMessage.mockReset()
		publishMessage.mockResolvedValue()
	})

	it.each([
		{ ...validMessage(), orderId: 'not-a-uuid' },
		{ ...validMessage(), amount: 0 },
		{ ...validMessage(), amount: 10.001 },
		{ ...validMessage(), items: [] },
		{ ...validMessage(), paymentMethod: 'x'.repeat(51) },
	])('rejects invalid input before every publication path', async (message) => {
		expect(
			await service.validatePaymentOrder(message as PaymentOrderMessage),
		).toBe(false)
		await expect(
			service.publishPaymentOrder(message as PaymentOrderMessage),
		).rejects.toThrow('Invalid payment order')
		await expect(
			service.publishPaymentOrderSafely(message as PaymentOrderMessage),
		).rejects.toThrow('Invalid payment order')
		expect(publishMessage).not.toHaveBeenCalled()
	})

	it('publishes only validated fields with stable routing and generated metadata', async () => {
		const message = {
			...validMessage(),
			paymentMethod: '  pix  ',
			cartId: 'must-not-be-published',
		} as PaymentOrderMessage

		await service.publishPaymentOrder(message)

		expect(publishMessage).toHaveBeenCalledTimes(1)
		const [exchange, routingKey, published] = publishMessage.mock.calls[0]
		expect(exchange).toBe('payments')
		expect(routingKey).toBe('payment.order')
		expect(published).toMatchObject({
			orderId: message.orderId,
			userId: message.userId,
			amount: message.amount,
			paymentMethod: 'pix',
			metadata: {
				service: 'checkout-service',
				timestamp: expect.any(String),
			},
			createdAt: expect.any(String),
		})
		expect(published).not.toHaveProperty('cartId')
		expect(
			new Date((published as PaymentOrderMessage).createdAt ?? '').getTime(),
		).not.toBeNaN()
	})

	it('preserves a supplied creation timestamp and replaces incoming metadata', async () => {
		const createdAt = '2026-08-30T20:00:00.000Z'
		await service.publishPaymentOrder({
			...validMessage(),
			createdAt,
			metadata: {
				service: 'untrusted-service',
				timestamp: '2026-08-30T19:00:00.000Z',
			},
		})

		const published = publishMessage.mock.calls[0][2] as PaymentOrderMessage
		expect(published.createdAt).toBe(createdAt)
		expect(published.metadata?.service).toBe('checkout-service')
		expect(published.metadata?.timestamp).not.toBe(
			'2026-08-30T19:00:00.000Z',
		)
	})
})

describe('toPaymentOrderMessage', () => {
	it('normalizes decimal values and emits only payment fields', () => {
		const order = {
			id: '20dcbb35-2685-4547-a7b0-2929b720589a',
			userId: '07ad3bed-9b52-4ec0-a79f-70b2a55c290c',
			cartId: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			total: '19.99' as unknown as number,
			status: 'pending',
			paymentMethod: 'pix',
			createdAt: new Date('2026-08-30T20:00:00.000Z'),
		} as Order
		const cart = {
			id: order.cartId,
			items: [
				{
					productId: '9884e844-1496-4cb8-8d73-a9dbce564f61',
					productName: 'Must stay internal',
					price: '19.99' as unknown as number,
					quantity: 1,
					subtotal: 19.99,
				},
			],
		} as Cart

		const message = toPaymentOrderMessage(order, cart)

		expect(message).toEqual({
			orderId: order.id,
			userId: order.userId,
			amount: 19.99,
			items: [
				{
					productId: cart.items[0].productId,
					quantity: 1,
					price: 19.99,
				},
			],
			paymentMethod: 'pix',
			createdAt: '2026-08-30T20:00:00.000Z',
		})
		expect(message).not.toHaveProperty('cartId')
		expect(message).not.toHaveProperty('status')
		expect(message.items[0]).not.toHaveProperty('productName')
		expect(message.items[0]).not.toHaveProperty('subtotal')
	})
})
