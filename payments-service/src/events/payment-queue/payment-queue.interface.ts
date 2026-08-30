import z from 'zod'

const MAX_MONEY_VALUE = 99_999_999.99

const hasAtMostTwoDecimalPlaces = (value: number): boolean => {
	const valueInCents = value * 100
	const tolerance = Number.EPSILON * Math.max(1, Math.abs(valueInCents))

	return Math.abs(valueInCents - Math.round(valueInCents)) <= tolerance
}

const moneySchema = z
	.number()
	.finite()
	.positive()
	.max(MAX_MONEY_VALUE)
	.refine(hasAtMostTwoDecimalPlaces, 'Must have at most two decimal places')

const isoDateTimeSchema = z.string().datetime({ offset: true })

const paymentItemSchema = z.object({
	productId: z.uuid(),
	quantity: z.number().finite().int().positive(),
	price: moneySchema,
})

const messageMetadataSchema = z.object({
	service: z.string().trim().min(1),
	timestamp: isoDateTimeSchema,
})

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
	orderId: z.uuid(),
	userId: z.uuid(),
	amount: moneySchema,
	items: z.array(paymentItemSchema).min(1),
	paymentMethod: z.string().trim().min(1).max(50),
	description: z.string().optional(),
	createdAt: isoDateTimeSchema.optional(),
	metadata: messageMetadataSchema.optional(),
})

export const publishedPaymentOrderMessageSchema = paymentOrderMessageSchema.extend({
	createdAt: isoDateTimeSchema,
	metadata: z.object({
		service: z.literal('checkout-service'),
		timestamp: isoDateTimeSchema,
	}),
})

export type PublishedPaymentOrderMessage = z.infer<
	typeof publishedPaymentOrderMessageSchema
>
