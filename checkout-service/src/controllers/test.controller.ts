import { Controller, Post } from '@nestjs/common'
import { PaymentOrderMessage } from '../events/payment-queue/payment-queue.interface'
import { PaymentsQueueService } from '../events/payment-queue/payments-queue.service'

@Controller('test')
export class TestController {
	constructor(private paymentQueueService: PaymentsQueueService) {}

	@Post('send-payment')
	async testPayment() {
		const paymentOrder: PaymentOrderMessage = {
			orderId: '12345',
			userId: 'user-001',
			amount: -100,
			items: [
				{
					productId: 'prod-001',
					quantity: 1,
					price: 100.0,
				},
			],
			paymentMethod: 'credit_card',
		}

		try {
			const result =
				await this.paymentQueueService.publishPaymentOrderSafely(paymentOrder)

			return {
				status: 'success',
				data: result,
			}
		} catch {
			return {
				status: 'error',
				error: 'Failed to publish payment order',
			}
		}
	}
}
