import z from 'zod'

export enum UserRole {
	SELLER = 'seller',
	BUYER = 'buyer',
}

export const jwtPayloadSchema = z.object({
	sub: z.uuid(),
	email: z.email(),
	role: z.enum(UserRole),
})

export type JwtPayload = z.infer<typeof jwtPayloadSchema>
