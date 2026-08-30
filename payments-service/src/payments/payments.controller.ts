import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common'
import type { PaymentResponse } from './dtos/payment-response'
import { PaymentsService } from './payments.service'

@Controller('payments')
export class PaymentsController {
	constructor(private readonly paymentsService: PaymentsService) {}

	@Get(':orderId')
	findByOrderId(
		@Param('orderId', new ParseUUIDPipe()) orderId: string,
	): Promise<PaymentResponse> {
		return this.paymentsService.findByOrderId(orderId)
	}
}
