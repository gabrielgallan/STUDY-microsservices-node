import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { PublicUserDto } from '../../../users/dtos/profile.dto'

export const loginSchema = z
	.object({
		email: z.string().trim().toLowerCase().pipe(z.email()),
		password: z.string().min(6),
	})
	.strict()

export class LoginDto extends createZodDto(loginSchema) {
	@ApiProperty({
		example: 'user@example.com',
	})
	email!: string

	@ApiProperty({
		example: 'password123',
	})
	password!: string
}

export class LoginResponseDto {
	@ApiProperty({ type: PublicUserDto })
	user!: PublicUserDto

	@ApiProperty({
		example:
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhN2NkOTI3ZC1kZTkyLTRhZjgtYjE2Yy03OTdiYjFlYzE2NDEiLCJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJyb2xlIjoic2VsbGVyIiwiaWF0IjoxNzg4MjE5OTk2LCJleHAiOjE3ODgzMDYzOTZ9.YlWSGyzGhozEbVAjEKPLGr6X_WpS2wwRHBhwS_kWvBM',
		description: 'JWT access token',
	})
	token!: string
}
