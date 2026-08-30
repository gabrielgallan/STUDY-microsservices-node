import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { Public } from '../decorators/public.decorator'
import { AuthService } from '../services/auth.service'
import { LoginDto } from './dtos/login.dto'
import { RegisterDto } from './dtos/register.dto'

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@ApiOperation({ summary: 'User login' })
	@ApiResponse({ status: 200, description: 'User logged in successfully' })
	@ApiResponse({ status: 400, description: 'Invalid data' })
	@Post('login')
	@HttpCode(200)
	@Public()
	@Throttle({ short: { limit: 5, ttl: 60000 } })
	login(@Body() loginDto: LoginDto) {
		return this.authService.login(loginDto)
	}

	@ApiOperation({ summary: 'User registration' })
	@ApiResponse({ status: 201, description: 'User registered successfully' })
	@ApiResponse({ status: 400, description: 'Invalid data' })
	@Post('register')
	@HttpCode(201)
	@Public()
	@Throttle({ medium: { limit: 3, ttl: 60000 } })
	register(@Body() registerDto: RegisterDto) {
		return this.authService.register(registerDto)
	}
}
