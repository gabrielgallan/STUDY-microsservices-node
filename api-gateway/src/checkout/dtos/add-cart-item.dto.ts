import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { CartDto } from './cart.dto'

export const addCartItemSchema = z
	.object({
		productId: z.uuid(),
		quantity: z.number().int().min(1),
	})
	.strict()

export class AddCartItemDto extends createZodDto(addCartItemSchema) {
	@ApiProperty({
		example: '3f1a8c22-9d4e-4f0b-8a13-6b7c5e2d1a90',
	})
	productId!: string

	@ApiProperty({
		example: 2,
	})
	quantity!: number
}

export class AddCartItemResponseDto extends CartDto {}
