import { createZodDto } from 'nestjs-zod'
import z from 'zod'
import { UserRole } from '../../../users/entities/user.entity'

export const registerSchema = z
	.object({
		email: z.string().trim().toLowerCase().pipe(z.email()),
		password: z.string().min(6),
		firstName: z.string().trim().min(1).max(100),
		lastName: z.string().trim().min(1).max(100),
		role: z.enum(UserRole),
	})
	.strict()

export type RegisterInput = z.infer<typeof registerSchema>

export class RegisterDto extends createZodDto(registerSchema) {}
