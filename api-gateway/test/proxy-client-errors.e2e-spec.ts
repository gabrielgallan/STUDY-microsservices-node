import { HttpService } from '@nestjs/axios'
import { HttpException } from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { CircuitBreakerService } from '../src/common/circuit-breaker/circuit-breaker.service'
import { CacheFallbackService } from '../src/common/fallback/cache-fallback.service'
import { DefaultFallbackService } from '../src/common/fallback/default-fallback.service'
import { RetryService } from '../src/common/retry/retry.service'
import { TimeoutService } from '../src/common/timeout/timeout.service'
import { ProxyService } from '../src/proxy/service/proxy.service'

describe('ProxyService downstream response handling', () => {
	const request = jest.fn()
	const setCachedData = jest.fn()
	const cacheFallbackExecution = jest.fn(async () => ({ products: [] }))
	const errorFallbackExecution = jest.fn(async () => {
		throw new Error('Products service is currently unavailable')
	})
	const executeWithExponentialBackoff = jest.fn(
		async (operation: () => Promise<unknown>) => operation(),
	)
	const executeWithCustomTimeout = jest.fn(async (operation: () => Promise<unknown>) =>
		operation(),
	)
	const executeWithCircuitBreaker = jest.fn(
		async (
			operation: () => Promise<unknown>,
			_key: string,
			fallback: () => Promise<unknown>,
		) => {
			try {
				return await operation()
			} catch {
				return fallback()
			}
		},
	)

	const service = new ProxyService(
		{ request } as unknown as HttpService,
		{ executeWithCircuitBreaker } as unknown as CircuitBreakerService,
		{
			createErrorFallback: jest.fn(() => errorFallbackExecution),
		} as unknown as DefaultFallbackService,
		{
			setCachedData,
			createCacheFallback: jest.fn(() => cacheFallbackExecution),
		} as unknown as CacheFallbackService,
		{ executeWithCustomTimeout } as unknown as TimeoutService,
		{ executeWithExponentialBackoff } as unknown as RetryService,
	)

	beforeEach(() => {
		jest.clearAllMocks()
	})

	it.each([400, 401, 403, 404])(
		'preserves downstream HTTP %s without executing fallback or caching',
		async (status) => {
			const body = { statusCode: status, message: `Downstream ${status}` }
			request.mockReturnValueOnce(of({ status, data: body }))

			let receivedError: unknown
			try {
				await service.proxyRequest('products', 'get', '/products/missing')
			} catch (error) {
				receivedError = error
			}

			expect(receivedError).toBeInstanceOf(HttpException)
			expect((receivedError as HttpException).getStatus()).toBe(status)
			expect((receivedError as HttpException).getResponse()).toEqual(body)
			expect(request).toHaveBeenCalledTimes(1)
			expect(executeWithExponentialBackoff).toHaveBeenCalledTimes(1)
			expect(cacheFallbackExecution).not.toHaveBeenCalled()
			expect(errorFallbackExecution).not.toHaveBeenCalled()
			expect(setCachedData).not.toHaveBeenCalled()

			const requestConfig = request.mock.calls[0][0]
			expect(requestConfig.validateStatus(status)).toBe(true)
			expect(requestConfig.validateStatus(500)).toBe(false)
		},
	)

	it('preserves a users-service JWT validation 401 without retry or fallback', async () => {
		const authorization = 'Bearer original-jwt'
		const body = { statusCode: 401, message: 'Unauthorized' }
		request.mockReturnValueOnce(of({ status: 401, data: body }))

		let receivedError: unknown
		try {
			await service.proxyRequest('users', 'get', '/auth/validate-token', undefined, {
				Authorization: authorization,
			})
		} catch (error) {
			receivedError = error
		}

		expect(receivedError).toBeInstanceOf(HttpException)
		expect((receivedError as HttpException).getStatus()).toBe(401)
		expect((receivedError as HttpException).getResponse()).toEqual(body)
		expect(request).toHaveBeenCalledTimes(1)
		expect(request.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				method: 'get',
				url: 'http://localhost:3001/auth/validate-token',
				headers: expect.objectContaining({ Authorization: authorization }),
			}),
		)
		expect(executeWithExponentialBackoff).toHaveBeenCalledTimes(1)
		expect(cacheFallbackExecution).not.toHaveBeenCalled()
		expect(errorFallbackExecution).not.toHaveBeenCalled()
		expect(setCachedData).not.toHaveBeenCalled()
	})

	it.each([
		['a downstream 500', new Error('Request failed with status code 500')],
		['a network failure', new Error('ECONNREFUSED')],
	])('keeps %s on the resilience fallback path', async (_case, error) => {
		request.mockReturnValueOnce(throwError(() => error))

		const response = await service.proxyRequest('products', 'get', '/products')

		expect(response).toEqual({ products: [] })
		expect(executeWithExponentialBackoff).toHaveBeenCalledTimes(1)
		expect(executeWithCircuitBreaker).toHaveBeenCalledTimes(1)
		expect(cacheFallbackExecution).toHaveBeenCalledTimes(1)
	})
})
