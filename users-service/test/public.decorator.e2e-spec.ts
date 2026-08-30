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
})
