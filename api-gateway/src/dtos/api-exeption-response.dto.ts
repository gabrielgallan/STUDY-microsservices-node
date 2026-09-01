import { ApiProperty } from '@nestjs/swagger'

export class ApiExceptionResponseDto {
	@ApiProperty({
		example: 400,
		description: 'HTTP status code',
	})
	statusCode!: number

	@ApiProperty({
		example: 'Invalid request data',
		description: 'HTTP error description',
	})
	message!: string

	@ApiProperty({
		example: {},
	})
	error!: unknown
}
