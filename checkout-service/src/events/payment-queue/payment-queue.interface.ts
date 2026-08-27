import z from 'zod'

export interface PaymentOrderMessage {
	orderId: string
	userId: string
	amount: number
	items: {
		productId: string
		quantity: number
		price: number
	}[]
	paymentMethod: string
	description?: string
	createdAt?: string
	metadata?: {
		service: string
		timestamp: string
	}
}

export const paymentOrderMessageSchema = z.object({
	orderId: z.string(),
	userId: z.string(),
	amount: z.number().positive(),
	items: z.array(
		z.object({
			productId: z.string(),
			quantity: z.number().positive(),
			price: z.number().positive(),
		}),
	),
	paymentMethod: z.string(),
	description: z.string().optional(),
	createdAt: z.string().datetime().optional(),
	metadata: z
		.object({
			service: z.string(),
			timestamp: z.string().datetime(),
		})
		.optional(),
})
