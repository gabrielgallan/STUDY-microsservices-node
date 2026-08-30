import type { PaymentResponse } from './dtos/payment-response'
import type { Payment } from './entities/payment.entity'
import { toMoney } from './payment-money'

export const toPaymentResponse = (payment: Payment): PaymentResponse => ({
	id: payment.id,
	orderId: payment.orderId,
	userId: payment.userId,
	amount: toMoney(payment.amount),
	status: payment.status,
	paymentMethod: payment.paymentMethod,
	transactionId: payment.transactionId,
	rejectionReason: payment.rejectionReason,
	processedAt: payment.processedAt,
	createdAt: payment.createdAt,
	updatedAt: payment.updatedAt,
})
