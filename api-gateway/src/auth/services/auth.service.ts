import { HttpService } from '@nestjs/axios'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { firstValueFrom } from 'rxjs'
import { serviceConfig } from '../../config/gateway.config'
import { ProxyService } from '../../proxy/service/proxy.service'
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

export interface PublicUserResponse {
	id: string
	email: string
	firstName: string
	lastName: string
	role: 'seller' | 'buyer'
	status: 'active' | 'inactive'
	createdAt: string
	updatedAt: string
}

export interface LoginResponse {
	user: PublicUserResponse
	token: string
}

export interface TokenValidationResponse {
	userId: string
	email: string
	role: 'seller' | 'buyer'
}

@Injectable()
export class AuthService {
	constructor(
		private readonly httpService: HttpService,
		private readonly proxyService: ProxyService,
	) {}

	async validateJwtToken(authorization: string): Promise<TokenValidationResponse> {
		return (await this.proxyService.proxyRequest(
			'users',
			'get',
			'/auth/validate-token',
			undefined,
			{ Authorization: authorization },
		)) as TokenValidationResponse
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
	async login(loginDto: LoginDto): Promise<LoginResponse> {
		return (await this.proxyService.proxyRequest(
			'users',
			'post',
			'/auth/login',
			loginDto,
		)) as LoginResponse
	}

	async register(registerDto: RegisterDto): Promise<PublicUserResponse> {
		return (await this.proxyService.proxyRequest(
			'users',
			'post',
			'/auth/register',
			registerDto,
		)) as PublicUserResponse
	}
}
