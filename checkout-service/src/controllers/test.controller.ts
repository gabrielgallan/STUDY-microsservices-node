import { Controller, Post } from '@nestjs/common'
import { PaymentOrderMessage } from '../events/payment-queue/payment-queue.interface'
import { PaymentsQueueService } from '../events/payment-queue/payments-queue.service'

@Controller('test')
export class TestController {
	constructor(private paymentQueueService: PaymentsQueueService) {}

	@Post('send-payment')
	async testPayment() {
		const paymentOrder: PaymentOrderMessage = {
			orderId: '20dcbb35-2685-4547-a7b0-2929b720589a',
			userId: '07ad3bed-9b52-4ec0-a79f-70b2a55c290c',
			amount: 100,
			items: [
				{
					productId: '9884e844-1496-4cb8-8d73-a9dbce564f61',
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
