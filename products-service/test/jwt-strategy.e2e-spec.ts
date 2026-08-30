import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy'
import { EnvService } from '../src/env/env.service'

describe('JwtStrategy', () => {
	const strategy = new JwtStrategy({
		get: () => 'products-service-e2e-secret',
	} as unknown as EnvService)

	it('maps valid domain claims to the authenticated identity', () => {
		const payload = strategy.validate({
			sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
			iat: 1,
			exp: 2,
			password: 'must-not-be-propagated',
		})

		expect(payload).toEqual({
			id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
		})
	})

	it.each([
		{
			sub: 'not-a-uuid',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
		},
		{
			sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'not-an-email',
			role: UserRole.BUYER,
		},
		{
			sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: 'admin',
		},
	])('rejects a payload outside the domain contract', (payload) => {
		expect(() => strategy.validate(payload)).toThrow('Unauthorized')
	})
})
