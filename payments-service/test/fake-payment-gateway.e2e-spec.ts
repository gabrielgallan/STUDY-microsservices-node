import { randomUUID } from 'node:crypto'
import {
	CARD_DECLINED_REASON,
	FakePaymentGatewayService,
	LIMIT_EXCEEDED_REASON,
	type PaymentChargeRequest,
} from '../src/payments/fake-payment-gateway.service'

/** Exposes the protected sleep so the suite never really waits. */
class TestableFakePaymentGatewayService extends FakePaymentGatewayService {
	readonly sleepCalls: number[] = []

	protected sleep(milliseconds: number): Promise<void> {
		this.sleepCalls.push(milliseconds)

		return Promise.resolve()
	}
}

const chargeRequest = (amount: number): PaymentChargeRequest => ({
	orderId: randomUUID(),
	userId: randomUUID(),
	amount,
	paymentMethod: 'credit_card',
})

describe('FakePaymentGatewayService', () => {
	let gateway: TestableFakePaymentGatewayService

	beforeEach(() => {
		gateway = new TestableFakePaymentGatewayService()
	})

	it.each([10000.01, 10001, 20000, 99999.98])(
		'rejects %p for exceeding the limit',
		async (amount) => {
			const result = await gateway.charge(chargeRequest(amount))

			expect(result.approved).toBe(false)
			expect(result.rejectionReason).toBe(LIMIT_EXCEEDED_REASON)
		},
	)

	it.each([0.99, 10.99, 49.99, 1999.99, 9999.99])(
		'rejects %p because the cents are 99',
		async (amount) => {
			const result = await gateway.charge(chargeRequest(amount))

			expect(result.approved).toBe(false)
			expect(result.rejectionReason).toBe(CARD_DECLINED_REASON)
		},
	)

	it('rejects 10000.99 for the limit, proving the rule precedence', async () => {
		const result = await gateway.charge(chargeRequest(10000.99))

		expect(result.approved).toBe(false)
		expect(result.rejectionReason).toBe(LIMIT_EXCEEDED_REASON)
	})

	it.each([10000, 100, 49.9, 0.01, 9999.98])(
		'approves %p',
		async (amount) => {
			const result = await gateway.charge(chargeRequest(amount))

			expect(result.approved).toBe(true)
			expect(result.rejectionReason).toBeUndefined()
		},
	)

	it('returns a transaction id on approvals and on rejections', async () => {
		const approved = await gateway.charge(chargeRequest(100))
		const rejected = await gateway.charge(chargeRequest(20000))

		expect(approved.transactionId).toEqual(expect.any(String))
		expect(approved.transactionId.length).toBeGreaterThan(0)
		expect(rejected.transactionId).toEqual(expect.any(String))
		expect(rejected.transactionId.length).toBeGreaterThan(0)
	})

	it('returns a distinct transaction id per attempt', async () => {
		const results = await Promise.all([
			gateway.charge(chargeRequest(100)),
			gateway.charge(chargeRequest(100)),
			gateway.charge(chargeRequest(100)),
		])
		const transactionIds = new Set(results.map((result) => result.transactionId))

		expect(transactionIds.size).toBe(3)
	})

	it('waits a simulated latency between 500ms and 2000ms', async () => {
		for (let attempt = 0; attempt < 25; attempt += 1) {
			await gateway.charge(chargeRequest(100))
		}

		expect(gateway.sleepCalls).toHaveLength(25)
		for (const milliseconds of gateway.sleepCalls) {
			expect(milliseconds).toBeGreaterThanOrEqual(
				FakePaymentGatewayService.MIN_LATENCY_MS,
			)
			expect(milliseconds).toBeLessThanOrEqual(
				FakePaymentGatewayService.MAX_LATENCY_MS,
			)
		}
	})

	it('is deterministic: the same amount always yields the same outcome', async () => {
		const first = await gateway.charge(chargeRequest(49.99))
		const second = await gateway.charge(chargeRequest(49.99))

		expect(first.approved).toBe(second.approved)
		expect(first.rejectionReason).toBe(second.rejectionReason)
	})
})
