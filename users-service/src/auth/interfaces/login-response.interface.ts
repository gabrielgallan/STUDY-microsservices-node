import type { PublicUser } from './public-user.interface'

export interface LoginResponse {
	user: PublicUser
	token: string
}
