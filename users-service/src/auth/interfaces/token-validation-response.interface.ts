import type { UserRole } from '../../users/entities/user.entity'

export interface TokenValidationResponse {
	userId: string
	email: string
	role: UserRole
}
