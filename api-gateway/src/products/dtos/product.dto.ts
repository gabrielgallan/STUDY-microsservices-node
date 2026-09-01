import { ApiProperty } from '@nestjs/swagger'

export class ProductDto {
	@ApiProperty({
		example: '3f1a8c22-9d4e-4f0b-8a13-6b7c5e2d1a90',
	})
	id!: string

	@ApiProperty({
		example: 'Ergonomic chair',
	})
	name!: string

	@ApiProperty({
		example: 'Mesh office chair with adjustable lumbar support',
	})
	description!: string

	/**
	 * The products-service maps no numeric column: reads answer the decimal as a
	 * string, while the creation response echoes the number that was sent.
	 */
	@ApiProperty({
		oneOf: [{ type: 'number' }, { type: 'string' }],
		example: '129.90',
		description:
			'Unit price with two decimals. Read routes serialize it as a decimal string',
	})
	price!: number | string

	@ApiProperty({
		example: 12,
	})
	stock!: number

	@ApiProperty({
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
		description: 'Identifier of the seller that owns the product',
	})
	sellerId!: string

	@ApiProperty({
		example: true,
	})
	isActive!: boolean

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	createdAt!: string

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	updatedAt!: string
}
