import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class CacheFallbackService {
	private logger = new Logger(CacheFallbackService.name)
	private cache = new Map<string, { data: any; timestamp: number }>()

	async getCachedData<T>(key: string, timeout: number = 300000) {
		const cacheHit = this.cache.get(key)

		if (!cacheHit) {
			return null
		}

		const isExpired = Date.now() - cacheHit.timestamp > timeout

		if (isExpired) {
			this.cache.delete(key)
			return null
		}

		return cacheHit.data as T
	}

	setCachedData<T>(key: string, data: T) {
		this.cache.set(key, { data, timestamp: Date.now() })
	}

	createCacheFallback<T>(
		key: string,
		defaultData: T,
		timeout: number = 300000,
	): () => Promise<T> {
		return async () => {
			const cachedData = await this.getCachedData<T>(key, timeout)

			if (cachedData) {
				return cachedData
			}

			this.setCachedData(key, defaultData)

			return defaultData
		}
	}
}
