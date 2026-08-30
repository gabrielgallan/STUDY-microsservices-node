import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { PaymentOrderMessage } from '../events/payment-queue/payment-queue.interface'
import type { PaymentResponse } from './dtos/payment-response'
import { Payment, PaymentStatus } from './entities/payment.entity'
import { FakePaymentGatewayService } from './fake-payment-gateway.service'
import { toPaymentResponse } from './payment-response.mapper'

@Injectable()
export class PaymentsService {
	private readonly logger = new Logger(PaymentsService.name)

	constructor(
		@InjectRepository(Payment)
		private readonly paymentsRepository: Repository<Payment>,
		private readonly fakePaymentGatewayService: FakePaymentGatewayService,
	) {}

	/**
	 * Idempotent by order: retries and dead-letter reprocessing redeliver the
	 * same message, and an order must never be charged twice.
	 */
	async processPayment(message: PaymentOrderMessage): Promise<Payment> {
		const existingPayment = await this.paymentsRepository.findOneBy({
			orderId: message.orderId,
		})

		if (existingPayment) {
			this.logger.log(
				`Order ${message.orderId} was already processed with status ${existingPayment.status}`,
			)

			return existingPayment
		}

		const payment = await this.paymentsRepository.save(
			this.paymentsRepository.create({
				orderId: message.orderId,
				userId: message.userId,
				amount: message.amount,
				paymentMethod: message.paymentMethod,
				status: PaymentStatus.PENDING,
			}),
		)

		const result = await this.fakePaymentGatewayService.charge({
			orderId: message.orderId,
			userId: message.userId,
			amount: message.amount,
			paymentMethod: message.paymentMethod,
		})

		payment.status = result.approved
			? PaymentStatus.APPROVED
			: PaymentStatus.REJECTED
		payment.transactionId = result.transactionId
		payment.rejectionReason = result.rejectionReason ?? null
		payment.processedAt = new Date()

		return this.paymentsRepository.save(payment)
	}

	async findByOrderId(orderId: string): Promise<PaymentResponse> {
		const payment = await this.paymentsRepository.findOneBy({ orderId })

		if (!payment) {
			throw new NotFoundException('Pagamento não encontrado')
		}

		return toPaymentResponse(payment)
	}
}
