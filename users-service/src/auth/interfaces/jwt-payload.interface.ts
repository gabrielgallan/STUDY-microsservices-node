import z from 'zod'
import { UserRole } from '../../users/entities/user.entity'

export const jwtPayloadSchema = z.object({
	sub: z.uuid(),
	email: z.email(),
	role: z.enum(UserRole),
})

export type JwtPayload = z.infer<typeof jwtPayloadSchema>
