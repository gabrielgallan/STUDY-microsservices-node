import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const loginSchema = z.object({
	email: z.email(),
	password: z.string().min(6),
})

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
