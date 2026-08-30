import { HttpService } from '@nestjs/axios'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { serviceConfig } from '../../config/gateway.config'
import { LoginDto } from '../controllers/dtos/login.dto'
import { RegisterDto } from '../controllers/dtos/register.dto'

export interface UserSession {
	valid: boolean
	user: {
		id: string
		email: string
		role: string
		firstName: string
		lastName: string
		status: string
	} | null
}

interface AuthResponse {
	accessToken: string
	user: {
		id: string
		email: string
		role: string
		firstName: string
		lastName: string
		status: string
	}
}

export interface TokenValidationResponse {
	userId: string
	email: string
	role: 'seller' | 'buyer'
}

@Injectable()
export class AuthService {
	constructor(private httpService: HttpService) {}

	async validateJwtToken(
		authorization: string,
	): Promise<TokenValidationResponse> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.get<TokenValidationResponse>(
					`${serviceConfig.users.url}/auth/validate-token`,
					{
						headers: { Authorization: authorization },
						timeout: serviceConfig.users.timeout,
					},
				),
			)

			return data
		} catch {
			throw new UnauthorizedException('Invalid token')
		}
	}

	async validateSessionToken(sessionToken: string): Promise<UserSession> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.get(
					`${serviceConfig.users.url}/sessions/validate/${sessionToken}`,
					{
						timeout: serviceConfig.users.timeout,
					},
				),
			)

			return data
		} catch {
			throw new UnauthorizedException('Invalid session token')
		}
	}
	async login(loginDto: LoginDto): Promise<AuthResponse> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.post(`${serviceConfig.users.url}/login`, loginDto, {
					timeout: serviceConfig.users.timeout,
				}),
			)

			return data
		} catch {
			throw new UnauthorizedException('Invalid credentials')
		}
	}
	async register(registerDto: RegisterDto): Promise<AuthResponse> {
		try {
			const { data } = await firstValueFrom(
				this.httpService.post(`${serviceConfig.users.url}/register`, registerDto, {
					timeout: serviceConfig.users.timeout,
				}),
			)

			return data
		} catch {
			throw new UnauthorizedException('Registration failed')
		}
	}
}
