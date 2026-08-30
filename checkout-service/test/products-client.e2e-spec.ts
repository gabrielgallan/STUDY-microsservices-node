import { randomUUID } from 'node:crypto'
import type { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { AxiosError, type AxiosResponse } from 'axios'
import { of, throwError } from 'rxjs'
import {
	ProductNotFoundError,
	ProductsServiceUnavailableError,
} from '../src/cart/clients/products-client.errors'
import { ProductsClientService } from '../src/cart/clients/products-client.service'
import type { EnvService } from '../src/env/env.service'

const PRODUCTS_SERVICE_URL = 'http://products-service.invalid:3002'

const validProduct = () => ({
	id: randomUUID(),
	name: 'Teclado mecânico',
	price: 199.9,
	stock: 10,
	isActive: true,
	sellerId: randomUUID(),
})

const axiosErrorWithStatus = (status: number) => {
	const error = new AxiosError('Request failed')
	error.response = {
		status,
		data: { message: 'internal detail that must not leak' },
	} as AxiosResponse

	return error
}

describe('ProductsClientService', () => {
	const get = jest.fn()
	const envService = {
		get: jest.fn(() => PRODUCTS_SERVICE_URL),
	} as unknown as EnvService
	const service = new ProductsClientService(
		{ get } as unknown as HttpService,
		envService,
	)

	beforeAll(() => {
		jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
	})

	afterAll(() => {
		jest.restoreAllMocks()
	})

	beforeEach(() => {
		get.mockReset()
	})

	it('requests the product from the configured PRODUCTS_SERVICE_URL', async () => {
		const product = validProduct()
		get.mockReturnValue(of({ data: product }))

		await service.getProduct(product.id)

		expect(envService.get).toHaveBeenCalledWith('PRODUCTS_SERVICE_URL')
		expect(get).toHaveBeenCalledWith(
			`${PRODUCTS_SERVICE_URL}/products/${product.id}`,
		)
	})

	it('does not send authorization headers or any credential', async () => {
		const product = validProduct()
		get.mockReturnValue(of({ data: product }))

		await service.getProduct(product.id)

		expect(get.mock.calls[0]).toHaveLength(1)
	})

	it('returns the normalized product contract', async () => {
		const product = validProduct()
		get.mockReturnValue(of({ data: product }))

		await expect(service.getProduct(product.id)).resolves.toEqual({
			id: product.id,
			name: product.name,
			price: 199.9,
			stock: 10,
			isActive: true,
			sellerId: product.sellerId,
		})
	})

	it('normalizes a textual price and drops unknown fields', async () => {
		const product = validProduct()
		get.mockReturnValue(
			of({
				data: { ...product, price: '199.90', stock: '10', description: 'ignored' },
			}),
		)

		const result = await service.getProduct(product.id)

		expect(result.price).toBe(199.9)
		expect(result.stock).toBe(10)
		expect(result).not.toHaveProperty('description')
	})

	it('signals a missing product when the products-service answers 404', async () => {
		const productId = randomUUID()
		get.mockReturnValue(throwError(() => axiosErrorWithStatus(404)))

		await expect(service.getProduct(productId)).rejects.toBeInstanceOf(
			ProductNotFoundError,
		)
	})

	it.each([
		['a server error', () => axiosErrorWithStatus(500)],
		['a network failure', () => new AxiosError('connect ECONNREFUSED')],
		['a timeout', () => new AxiosError('timeout of 5000ms exceeded')],
	])('signals unavailability on %s', async (_label, createError) => {
		get.mockReturnValue(throwError(createError))

		await expect(service.getProduct(randomUUID())).rejects.toBeInstanceOf(
			ProductsServiceUnavailableError,
		)
	})

	it.each([
		{ ...validProduct(), id: 'not-a-uuid' },
		{ ...validProduct(), name: '' },
		{ ...validProduct(), price: 'free' },
		{ ...validProduct(), isActive: 'yes' },
	])('signals unavailability when the payload breaks the contract', async (data) => {
		get.mockReturnValue(of({ data }))

		await expect(service.getProduct(randomUUID())).rejects.toBeInstanceOf(
			ProductsServiceUnavailableError,
		)
	})

	it('keeps internal details out of the failure messages', async () => {
		get.mockReturnValue(throwError(() => axiosErrorWithStatus(500)))

		await expect(service.getProduct(randomUUID())).rejects.toThrow(
			/^Products service is unavailable$/,
		)
	})
})
