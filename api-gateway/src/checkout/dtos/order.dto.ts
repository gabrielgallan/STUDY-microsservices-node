import { ApiProperty } from '@nestjs/swagger'

export class OrderDto {
	@ApiProperty({
		example: '6e5d4c3b-2a19-4f87-b6c5-d4e3f2a1b098',
	})
	id!: string

	@ApiProperty({
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
	})
	userId!: string

	@ApiProperty({
		example: '8d2c4b16-7f3e-4a5d-9c1b-0e6a3f8d5c24',
		description: 'Cart that originated the order',
	})
	cartId!: string

	@ApiProperty({
		example: 259.8,
	})
	total!: number

	@ApiProperty({
		example: 'pending',
		enum: ['pending', 'paid', 'failed', 'cancelled'],
		description: 'Stays pending until the payment is processed asynchronously',
	})
	status!: string

	@ApiProperty({
		example: 'pix',
	})
	paymentMethod!: string

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	createdAt!: string

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	updatedAt!: string
}
