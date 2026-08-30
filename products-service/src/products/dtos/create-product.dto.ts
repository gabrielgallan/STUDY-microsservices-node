import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const createProductSchema = z
	.object({
		name: z.string().trim().min(1).max(255),
		description: z.string().trim().min(1),
		price: z.number().finite().min(0.01).multipleOf(0.01),
		stock: z.number().int().min(0),
	})
	.strict()

export type CreateProductInput = z.infer<typeof createProductSchema>

export class CreateProductDto extends createZodDto(createProductSchema) {}
