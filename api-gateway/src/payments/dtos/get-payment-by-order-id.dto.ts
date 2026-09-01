import { ApiProperty } from '@nestjs/swagger'

export class GetPaymentByOrderIdResponseDto {
	@ApiProperty({
		example: '2b9c8d7e-6f5a-4b3c-8d1e-0f9a8b7c6d5e',
	})
	id!: string

	@ApiProperty({
		example: '6e5d4c3b-2a19-4f87-b6c5-d4e3f2a1b098',
	})
	orderId!: string

	@ApiProperty({
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
	})
	userId!: string

	@ApiProperty({
		example: 259.8,
		description: 'Total charged for the order',
	})
	amount!: number

	@ApiProperty({
		example: 'approved',
		enum: ['pending', 'approved', 'rejected'],
	})
	status!: string

	@ApiProperty({
		example: 'pix',
	})
	paymentMethod!: string

	@ApiProperty({
		example: 'TXN-8F3A21C7',
		type: String,
		nullable: true,
		description: 'Filled once the payment is approved',
	})
	transactionId!: string | null

	@ApiProperty({
		example: 'Pagamento recusado pela operadora',
		type: String,
		nullable: true,
		description: 'Filled only when the payment is rejected',
	})
	rejectionReason!: string | null

	@ApiProperty({
		example: '2026-08-30T19:30:26.512Z',
		type: String,
		nullable: true,
		description: 'Null while the payment message has not been processed yet',
	})
	processedAt!: string | null

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	createdAt!: string

	@ApiProperty({
		example: '2026-08-30T19:30:26.512Z',
	})
	updatedAt!: string
}
