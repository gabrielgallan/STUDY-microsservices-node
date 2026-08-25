import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const registerSchema = z.object({
	email: z.email(),
	password: z.string().min(6),
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	role: z.enum(['user', 'admin', 'seller']).optional().default('user'),
})

type Role = z.infer<typeof registerSchema>['role']

export class RegisterDto extends createZodDto(registerSchema) {
	@ApiProperty({
		example: 'user@example.com',
	})
	email!: string

	@ApiProperty({
		example: 'password123',
	})
	password!: string

	@ApiProperty({
		example: 'John',
	})
	firstName!: string

	@ApiProperty({
		example: 'Doe',
	})
	lastName!: string

	@ApiProperty({
		example: 'user',
	})
	role!: Role
}
