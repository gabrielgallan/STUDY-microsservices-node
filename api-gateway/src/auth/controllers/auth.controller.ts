import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ApiExceptionResponseDto } from '../../dtos/api-exeption-response.dto'
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe'
import { PublicUserDto } from '../../users/dtos/profile.dto'
import { Public } from '../decorators/public.decorator'
import { AuthService } from '../services/auth.service'
import { LoginDto, LoginResponseDto, loginSchema } from './dtos/login.dto'
import { RegisterDto, registerSchema } from './dtos/register.dto'

@ApiTags('Authentication')
@Controller('auth')
@Public()
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@ApiOperation({ summary: 'User login' })
	@ApiResponse({
		status: 200,
		description: 'User logged in successfully',
		type: LoginResponseDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid data',
		type: ApiExceptionResponseDto,
	})
	@Post('login')
	@HttpCode(200)
	@Throttle({ short: { limit: 5, ttl: 60000 } })
	login(@Body(new ZodValidationPipe(loginSchema)) loginDto: LoginDto) {
		return this.authService.login(loginDto)
	}

	@ApiOperation({ summary: 'User registration' })
	@ApiResponse({
		status: 201,
		description: 'User registered successfully',
		type: PublicUserDto,
	})
	@ApiResponse({
		status: 400,
		description: 'Invalid data',
		type: ApiExceptionResponseDto,
	})
	@Post('register')
	@HttpCode(201)
	@Throttle({ medium: { limit: 3, ttl: 60000 } })
	register(@Body(new ZodValidationPipe(registerSchema)) registerDto: RegisterDto) {
		return this.authService.register(registerDto)
	}
}
