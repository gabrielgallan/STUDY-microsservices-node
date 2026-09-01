import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { OrderDto } from './order.dto'

/**
 * The accepted payment methods are decided by the checkout-service: validating
 * only the shape here keeps the catalog owned by a single project, and an
 * unknown method is forwarded and refused by the service itself.
 */
export const checkoutSchema = z
	.object({
		paymentMethod: z.string().trim().min(1),
	})
	.strict()

export class CheckoutDto extends createZodDto(checkoutSchema) {
	@ApiProperty({
		example: 'pix',
		description:
			'Payment method accepted by the checkout-service: credit_card, debit_card, pix or boleto',
	})
	paymentMethod!: string
}

export class CheckoutResponseDto extends OrderDto {}
