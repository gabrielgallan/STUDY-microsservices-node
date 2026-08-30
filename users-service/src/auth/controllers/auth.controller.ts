import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import type { PublicUser } from '../../users/interfaces/public-user.interface'
import { Public } from '../decorators/public.decorator'
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface'
import type { LoginResponse } from '../interfaces/login-response.interface'
import type { TokenValidationResponse } from '../interfaces/token-validation-response.interface'
import { AuthService } from '../services/auth.service'
import { LoginDto } from './dtos/login.dto'
import { RegisterDto } from './dtos/register.dto'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Get('validate-token')
	@ApiBearerAuth('bearer')
	validateToken(
		@Req() request: AuthenticatedRequest,
	): TokenValidationResponse {
		return {
			userId: request.user.id,
			email: request.user.email,
			role: request.user.role,
		}
	}

	@Post('login')
	@HttpCode(HttpStatus.OK)
	@Public()
	login(@Body() input: LoginDto): Promise<LoginResponse> {
		return this.authService.login(input)
	}

	@Post('register')
	@Public()
	register(@Body() input: RegisterDto): Promise<PublicUser> {
		return this.authService.register(input)
	}
}
