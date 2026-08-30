import { envSchema } from '../src/env/env'

describe('Checkout environment schema', () => {
	it('requires a non-empty shared JWT secret', () => {
		expect(envSchema.safeParse({}).success).toBe(false)
		expect(envSchema.safeParse({ JWT_SECRET: '' }).success).toBe(false)
		expect(envSchema.safeParse({ JWT_SECRET: '   ' }).success).toBe(false)
		expect(
			envSchema.safeParse({ JWT_SECRET: 'checkout-service-secret' }).success,
		).toBe(true)
	})
})
