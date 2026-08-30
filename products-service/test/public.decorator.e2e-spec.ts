import { IS_PUBLIC_KEY, Public } from '../src/auth/decorators/public.decorator'

class PublicHandlerFixture {
	@Public()
	publicRoute() {}
}

@Public()
class PublicControllerFixture {}

describe('@Public()', () => {
	it('marks a handler with the shared isPublic metadata', () => {
		expect(
			Reflect.getMetadata(IS_PUBLIC_KEY, PublicHandlerFixture.prototype.publicRoute),
		).toBe(true)
	})

	it('marks a controller with the shared isPublic metadata', () => {
		expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicControllerFixture)).toBe(true)
	})
})
