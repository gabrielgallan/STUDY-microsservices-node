import { Injectable, Logger } from '@nestjs/common'

@Injectable()
export class DefaultFallbackService {
	private logger = new Logger(DefaultFallbackService.name)

	createDefaultFallback<T>(defaultData: T, serviceName: string): () => Promise<T> {
		return async () => {
			this.logger.warn(
				`Executing default fallback strategy for service: ${serviceName}`,
			)
			return defaultData
		}
	}

	createErrorFallback<T>(serviceName: string, errorMessage: string): () => Promise<T> {
		return async () => {
			this.logger.error(
				`Executing error fallback strategy for service: ${serviceName}. Error: ${errorMessage}`,
			)
			throw new Error(errorMessage)
		}
	}

	createEmptyArrayFallback<T>(serviceName: string): () => Promise<T[]> {
		return async () => {
			this.logger.warn(
				`Executing empty array fallback strategy for service: ${serviceName}`,
			)
			return [] as T[]
		}
	}

	createEmptyObjectFallback<T>(serviceName: string): () => Promise<T> {
		return async () => {
			this.logger.warn(
				`Executing empty object fallback strategy for service: ${serviceName}`,
			)
			return {} as T
		}
	}
}
