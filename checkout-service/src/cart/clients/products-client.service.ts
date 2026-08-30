import { HttpService } from '@nestjs/axios'
import { Injectable, Logger } from '@nestjs/common'
import { AxiosError } from 'axios'
import { firstValueFrom } from 'rxjs'
import z from 'zod'
import { EnvService } from '../../env/env.service'
import {
	ProductNotFoundError,
	ProductsServiceUnavailableError,
} from './products-client.errors'

export const externalProductSchema = z.object({
	id: z.uuid(),
	name: z.string().trim().min(1).max(255),
	price: z.coerce.number().finite().positive(),
	stock: z.coerce.number().int(),
	isActive: z.boolean(),
	sellerId: z.uuid(),
})

export type ExternalProduct = z.infer<typeof externalProductSchema>

@Injectable()
export class ProductsClientService {
	private readonly logger = new Logger(ProductsClientService.name)

	constructor(
		private readonly httpService: HttpService,
		private readonly envService: EnvService,
	) {}

	async getProduct(productId: string): Promise<ExternalProduct> {
		const url = `${this.envService.get('PRODUCTS_SERVICE_URL')}/products/${productId}`

		const response = await firstValueFrom(this.httpService.get(url)).catch(
			(error: unknown) => {
				if (error instanceof AxiosError && error.response?.status === 404) {
					throw new ProductNotFoundError(productId)
				}

				this.logger.error(
					`Failed to fetch product ${productId} from products-service`,
					error instanceof Error ? error.stack : undefined,
				)

				throw new ProductsServiceUnavailableError()
			},
		)

		const product = externalProductSchema.safeParse(response.data)

		if (!product.success) {
			this.logger.error(
				`products-service returned an unexpected payload for product ${productId}`,
				product.error.message,
			)

			throw new ProductsServiceUnavailableError()
		}

		return product.data
	}
}
