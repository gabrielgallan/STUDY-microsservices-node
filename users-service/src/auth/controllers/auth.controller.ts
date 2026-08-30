import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Public } from '../decorators/public.decorator'
import type { LoginResponse } from '../interfaces/login-response.interface'
import type { PublicUser } from '../interfaces/public-user.interface'
import { AuthService } from '../services/auth.service'
import { LoginDto } from './dtos/login.dto'
import { RegisterDto } from './dtos/register.dto'

@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

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
