import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Public } from '../src/auth/decorators/public.decorator'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import type { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy'
import { EnvService } from '../src/env/env.service'

class PublicHandlerFixture {
	@Public()
	publicRoute() {}
}

@Public()
class PublicControllerFixture {
	publicRoute() {}
}

class TestableJwtAuthGuard extends JwtAuthGuard {
	resolve(error: unknown, user: AuthenticatedUser | null | false) {
		return this.handleRequest(error, user)
	}
}

describe('Checkout JWT components', () => {
	const strategy = new JwtStrategy({
		get: () => 'checkout-service-e2e-secret',
	} as unknown as EnvService)

	it('maps only valid domain claims to the authenticated identity', () => {
		expect(
			strategy.validate({
				sub: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
				email: 'buyer@example.invalid',
				role: UserRole.BUYER,
				iat: 1,
				exp: 2,
				password: 'must-not-be-propagated',
			}),
		).toEqual({
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
	])('rejects a payload outside the shared JWT contract', (payload) => {
		expect(() => strategy.validate(payload)).toThrow(UnauthorizedException)
	})

	it.each([
		{
			controller: PublicHandlerFixture,
			handler: PublicHandlerFixture.prototype.publicRoute,
		},
		{
			controller: PublicControllerFixture,
			handler: PublicControllerFixture.prototype.publicRoute,
		},
	])('bypasses Passport for public metadata', ({ controller, handler }) => {
		const guard = new TestableJwtAuthGuard(new Reflector())
		const context = {
			getClass: () => controller,
			getHandler: () => handler,
		} as unknown as ExecutionContext

		expect(guard.canActivate(context)).toBe(true)
	})

	it('normalizes Passport failures to UnauthorizedException', () => {
		const guard = new TestableJwtAuthGuard(new Reflector())

		expect(() => guard.resolve(new Error('sensitive'), null)).toThrow(
			UnauthorizedException,
		)
		expect(() => guard.resolve(null, false)).toThrow(UnauthorizedException)
	})
})
