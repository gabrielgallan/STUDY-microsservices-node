import { Injectable, Logger } from '@nestjs/common'
import { RabbitmqService } from '../rabbitmq/rabbitmq.service'

@Injectable()
export class PaymentsQueueService {
	private logger = new Logger(PaymentsQueueService.name)

	private ROUTING_KEY = 'payment.order'
	private EXCHANGE = 'payments'
	private QUEUE_NAME = 'payment_queue'

	constructor(private rabbitmq: RabbitmqService) {}

	async consumePaymentOrder(callback: (message: any) => Promise<void>) {
		await this.rabbitmq.subscribeToQueue(
			this.QUEUE_NAME,
			this.EXCHANGE,
			this.ROUTING_KEY,
			async (message) => {
				this.logger.log(`Received payment order: ${JSON.stringify(message)}`)
				await callback(message)
			},
		)

		this.logger.log(
			`Subscribed to queue: ${this.QUEUE_NAME} with routing key: ${this.ROUTING_KEY}`,
		)
	}
}
