import type { PaymentStatus } from '../entities/payment.entity'

export interface PaymentResponse {
	id: string
	orderId: string
	userId: string
	amount: number
	status: PaymentStatus
	paymentMethod: string
	transactionId: string | null
	rejectionReason: string | null
	processedAt: Date | null
	createdAt: Date
	updatedAt: Date
}
