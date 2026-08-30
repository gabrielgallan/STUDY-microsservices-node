import { createZodDto } from 'nestjs-zod'
import z from 'zod'

export const loginSchema = z
	.object({
		email: z.string().trim().toLowerCase().pipe(z.email()),
		password: z.string().min(6),
	})
	.strict()

export type LoginInput = z.infer<typeof loginSchema>

export class LoginDto extends createZodDto(loginSchema) {}
