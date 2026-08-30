export class ProductNotFoundError extends Error {
	constructor(readonly productId: string) {
		super(`Product ${productId} not found`)
		this.name = 'ProductNotFoundError'
	}
}

export class ProductsServiceUnavailableError extends Error {
	constructor() {
		super('Products service is unavailable')
		this.name = 'ProductsServiceUnavailableError'
	}
}
