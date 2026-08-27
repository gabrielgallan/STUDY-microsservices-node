import { Injectable, Logger } from '@nestjs/common'
import { RabbitmqService } from '../rabbitmq/rabbitmq.service'
import {
	PaymentOrderMessage,
	paymentOrderMessageSchema,
} from './payment-queue.interface'

@Injectable()
export class PaymentsQueueService {
	private logger = new Logger(PaymentsQueueService.name)

	private ROUTING_KEY = 'payment.order'
	private EXCHANGE = 'payments'

	constructor(private rabbitmq: RabbitmqService) {}

	async publishPaymentOrder(paymentOrder: PaymentOrderMessage) {
		this.logger.log(`Publishing payment order: ${JSON.stringify(paymentOrder)}`)

		try {
			const enrichmentMessage: PaymentOrderMessage = {
				...paymentOrder,
				createdAt: paymentOrder.createdAt || new Date().toISOString(),
				metadata: {
					service: 'checkout-service',
					timestamp: new Date().toISOString(),
				},
			}

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
		try {
			await paymentOrderMessageSchema.parseAsync(paymentOrder)
			return true
		} catch (error) {
			this.logger.error('Failed to validate payment order', error)
			return false
		}
	}

	async publishPaymentOrderSafely(paymentOrder: PaymentOrderMessage) {
		const isValid = await this.validatePaymentOrder(paymentOrder)

		if (!isValid) {
			throw new Error('Invalid payment order')
		}

		await this.publishPaymentOrder(paymentOrder)
	}
}
