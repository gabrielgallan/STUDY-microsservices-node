import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const addCartItemSchema = z
	.object({
		productId: z.uuid(),
		quantity: z.number().int().min(1),
	})
	.strict()

export type AddCartItemInput = z.infer<typeof addCartItemSchema>

export class AddCartItemDto extends createZodDto(addCartItemSchema) {}
