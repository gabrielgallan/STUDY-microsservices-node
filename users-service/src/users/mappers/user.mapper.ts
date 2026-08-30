import type { User } from '../entities/user.entity'
import type { PublicUser } from '../interfaces/public-user.interface'

export const toPublicUser = (user: User): PublicUser => ({
	id: user.id,
	email: user.email,
	firstName: user.firstName,
	lastName: user.lastName,
	role: user.role,
	status: user.status,
	createdAt: user.createdAt,
	updatedAt: user.updatedAt,
})
