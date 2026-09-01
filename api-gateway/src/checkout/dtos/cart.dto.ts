import { ApiProperty } from '@nestjs/swagger'

export class CartItemDto {
	@ApiProperty({
		example: 'c19b7e40-5a2d-4f9c-9b3a-1e8d6f4c2b57',
	})
	id!: string

	@ApiProperty({
		example: '3f1a8c22-9d4e-4f0b-8a13-6b7c5e2d1a90',
	})
	productId!: string

	@ApiProperty({
		example: 'Ergonomic chair',
	})
	productName!: string

	@ApiProperty({
		example: 129.9,
		description: 'Unit price captured when the item was added to the cart',
	})
	price!: number

	@ApiProperty({
		example: 2,
	})
	quantity!: number

	@ApiProperty({
		example: 259.8,
	})
	subtotal!: number
}

export class CartDto {
	@ApiProperty({
		example: '8d2c4b16-7f3e-4a5d-9c1b-0e6a3f8d5c24',
		type: String,
		nullable: true,
		description: 'Null while the user has no active cart yet',
	})
	id!: string | null

	@ApiProperty({
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
	})
	userId!: string

	@ApiProperty({
		example: 'active',
		enum: ['active', 'completed', 'abandoned'],
	})
	status!: string

	@ApiProperty({
		type: [CartItemDto],
	})
	items!: CartItemDto[]

	@ApiProperty({
		example: 259.8,
	})
	total!: number

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
		type: String,
		nullable: true,
	})
	createdAt!: string | null

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
		type: String,
		nullable: true,
	})
	updatedAt!: string | null
}
