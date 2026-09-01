import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { ProductDto } from './product.dto'

/**
 * Mirrors the products-service contract, except for the cent precision, which
 * stays with the owner of the data to avoid two rounding rules for one field.
 */
export const createProductSchema = z
	.object({
		name: z.string().trim().min(1).max(255),
		description: z.string().trim().min(1),
		price: z.number().finite().min(0.01),
		stock: z.number().int().min(0),
	})
	.strict()

export class CreateProductDto extends createZodDto(createProductSchema) {
	@ApiProperty({
		example: 'Ergonomic chair',
	})
	name!: string

	@ApiProperty({
		example: 'Mesh office chair with adjustable lumbar support',
	})
	description!: string

	@ApiProperty({
		example: 129.9,
		description: 'Unit price with at most two decimals',
	})
	price!: number

	@ApiProperty({
		example: 12,
	})
	stock!: number
}

export class CreateProductResponseDto extends ProductDto {}
