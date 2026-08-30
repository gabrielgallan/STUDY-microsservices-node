import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { toCents } from './payment-money'

export const AMOUNT_LIMIT = 10000
export const LIMIT_EXCEEDED_REASON = 'Limite excedido'
export const CARD_DECLINED_REASON = 'Cartão recusado pela operadora'

export interface PaymentChargeRequest {
	orderId: string
	userId: string
	amount: number
	paymentMethod: string
}

export interface PaymentChargeResult {
	approved: boolean
	transactionId: string
	rejectionReason?: string
}

/**
 * Stands in for an external payment gateway. It performs no network call and
 * its decision is fully determined by the amount, so the outcome of any order
 * is reproducible.
 */
@Injectable()
export class FakePaymentGatewayService {
	static readonly MIN_LATENCY_MS = 500
	static readonly MAX_LATENCY_MS = 2000

	private readonly logger = new Logger(FakePaymentGatewayService.name)

	async charge(request: PaymentChargeRequest): Promise<PaymentChargeResult> {
		await this.sleep(this.randomLatency())

		const transactionId = `txn_${randomUUID()}`
		const rejectionReason = this.rejectionReasonFor(request.amount)

		if (rejectionReason) {
			this.logger.log(
				`Charge rejected for order ${request.orderId}: ${rejectionReason}`,
			)

			return { approved: false, transactionId, rejectionReason }
		}

		this.logger.log(`Charge approved for order ${request.orderId}`)

		return { approved: true, transactionId }
	}

	/**
	 * The limit rule is evaluated first, so an amount matching both rules — such
	 * as 10000.99 — is rejected for exceeding the limit.
	 */
	private rejectionReasonFor(amount: number): string | undefined {
		if (amount > AMOUNT_LIMIT) {
			return LIMIT_EXCEEDED_REASON
		}

		if (toCents(amount) % 100 === 99) {
			return CARD_DECLINED_REASON
		}

		return undefined
	}

	private randomLatency(): number {
		const { MIN_LATENCY_MS, MAX_LATENCY_MS } = FakePaymentGatewayService

		return (
			MIN_LATENCY_MS + Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS))
		)
	}

	/** Extension point: the test suite replaces it so it never really waits. */
	protected sleep(milliseconds: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, milliseconds))
	}
}
