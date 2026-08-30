import { AuthController } from '../src/auth/controllers/auth.controller'
import { IS_PUBLIC_KEY, Public } from '../src/auth/decorators/public.decorator'

class PublicControllerFixture {
	@Public()
	publicRoute() {}
}

describe('@Public()', () => {
	it('marks a handler with the shared isPublic metadata', () => {
		const metadata = Reflect.getMetadata(
			IS_PUBLIC_KEY,
			PublicControllerFixture.prototype.publicRoute,
		)

		expect(metadata).toBe(true)
	})

	it.each(['login', 'register'] as const)(
		'marks AuthController.%s as public',
		(route) => {
			const metadata = Reflect.getMetadata(
				IS_PUBLIC_KEY,
				AuthController.prototype[route],
			)

			expect(metadata).toBe(true)
		},
	)
})
