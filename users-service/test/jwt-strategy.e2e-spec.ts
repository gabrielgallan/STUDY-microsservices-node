import { JwtStrategy } from '../src/auth/strategies/jwt.strategy'
import { EnvService } from '../src/env/env.service'
import { UserRole } from '../src/users/entities/user.entity'

describe('JwtStrategy', () => {
	const strategy = new JwtStrategy({
		get: () => 'users-service-e2e-secret',
	} as unknown as EnvService)

	it('maps valid domain claims to the authenticated identity', () => {
		const payload = strategy.validate({
			sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
			iat: 1,
			exp: 2,
		})

		expect(payload).toEqual({
			id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
		})
	})

	it('rejects a payload outside the domain contract', () => {
		expect(() =>
			strategy.validate({
				sub: 'not-a-uuid',
				email: 'not-an-email',
				role: 'admin',
			}),
		).toThrow('Unauthorized')
	})
})
