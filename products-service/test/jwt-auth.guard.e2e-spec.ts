import { type ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Public } from '../src/auth/decorators/public.decorator'
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard'
import type { AuthenticatedUser } from '../src/auth/interfaces/authenticated-user.interface'
import { UserRole } from '../src/auth/interfaces/jwt-payload.interface'

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

describe('JwtAuthGuard', () => {
	const guard = new TestableJwtAuthGuard(new Reflector())

	it.each([
		{
			label: 'handler',
			controller: PublicHandlerFixture,
			handler: PublicHandlerFixture.prototype.publicRoute,
		},
		{
			label: 'controller',
			controller: PublicControllerFixture,
			handler: PublicControllerFixture.prototype.publicRoute,
		},
	])('bypasses Passport for a public $label', ({ controller, handler }) => {
		const context = {
			getClass: () => controller,
			getHandler: () => handler,
		} as unknown as ExecutionContext

		expect(guard.canActivate(context)).toBe(true)
	})

	it('returns the authenticated identity', () => {
		const user = {
			id: '9fe4cbf8-4ad8-4a37-bb3e-42f8126076b6',
			email: 'buyer@example.invalid',
			role: UserRole.BUYER,
		}

		expect(guard.resolve(null, user)).toBe(user)
	})

	it.each([
		['a Passport error', new Error('sensitive detail'), null],
		['an absent identity', null, null],
	] as const)('normalizes %s to UnauthorizedException', (_label, error, user) => {
		expect(() => guard.resolve(error, user)).toThrow(UnauthorizedException)
	})
})
