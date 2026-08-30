import { Injectable, Logger } from '@nestjs/common'
import { RabbitmqService } from '../rabbitmq/rabbitmq.service'
import {
	PaymentOrderMessage,
	paymentOrderMessageSchema,
	publishedPaymentOrderMessageSchema,
} from './payment-queue.interface'

@Injectable()
export class PaymentsQueueService {
	private logger = new Logger(PaymentsQueueService.name)

	private ROUTING_KEY = 'payment.order'
	private EXCHANGE = 'payments'

	constructor(private rabbitmq: RabbitmqService) {}

	async publishPaymentOrder(paymentOrder: PaymentOrderMessage) {
		const parsedPaymentOrder = paymentOrderMessageSchema.safeParse(paymentOrder)

		if (!parsedPaymentOrder.success) {
			this.logger.error('Failed to validate payment order')
			throw new Error('Invalid payment order')
		}

		this.logger.log(
			`Publishing payment order: ${JSON.stringify(parsedPaymentOrder.data)}`,
		)

		try {
			const enrichmentMessage = publishedPaymentOrderMessageSchema.parse({
				...parsedPaymentOrder.data,
				createdAt:
					parsedPaymentOrder.data.createdAt || new Date().toISOString(),
				metadata: {
					service: 'checkout-service',
					timestamp: new Date().toISOString(),
				},
			})

			await this.rabbitmq.publishMessage(
				this.EXCHANGE,
				this.ROUTING_KEY,
				enrichmentMessage,
			)

			this.logger.log(
				`Payment order published successfully: ${JSON.stringify(enrichmentMessage)}`,
			)
		} catch (error) {
			this.logger.error('Failed to publish payment order', error)

			throw error
		}
	}

	async validatePaymentOrder(paymentOrder: PaymentOrderMessage): Promise<boolean> {
		const result = await paymentOrderMessageSchema.safeParseAsync(paymentOrder)

		if (!result.success) {
			this.logger.error('Failed to validate payment order')
		}

		return result.success
	}

	async publishPaymentOrderSafely(paymentOrder: PaymentOrderMessage) {
		await this.publishPaymentOrder(paymentOrder)
	}
}
