import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const PAYMENT_METHODS = [
	'credit_card',
	'debit_card',
	'pix',
	'boleto',
] as const

export const checkoutSchema = z
	.object({
		paymentMethod: z.enum(PAYMENT_METHODS),
	})
	.strict()

export type CheckoutInput = z.infer<typeof checkoutSchema>

export class CheckoutDto extends createZodDto(checkoutSchema) {}
