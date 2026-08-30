import { ApiProperty } from '@nestjs/swagger'
import { createZodDto } from 'nestjs-zod'
import z from 'zod'

const registerSchema = z
	.object({
		email: z.string().trim().toLowerCase().pipe(z.email()),
		password: z.string().min(6),
		firstName: z.string().trim().min(1).max(100),
		lastName: z.string().trim().min(1).max(100),
		role: z.enum(['buyer', 'seller']),
	})
	.strict()

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
		example: 'buyer',
	})
	role!: Role
}
