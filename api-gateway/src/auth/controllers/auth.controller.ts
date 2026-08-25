import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler';
import { Public } from '../decorators/public.decorator';
import { LoginDto } from './dtos/login.dto';
import { RegisterDto } from './dtos/register.dto';

@ApiTags('Authentication')
@Controller('/api/auth')
export class AuthController {

    @ApiOperation({  summary: 'User login' })
    @ApiResponse({ status: 200, description: 'User logged in successfully' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @Post('login')
    @HttpCode(200)
    @Public()
    @Throttle({ short: { limit: 5, ttl: 60000 } })
    async login(@Body() loginDto: LoginDto) {
        // Implementation for login
    }
    
    @ApiOperation({ summary: 'User registration' })
    @ApiResponse({ status: 201, description: 'User registered successfully' })
    @ApiResponse({ status: 400, description: 'Invalid data' })
    @Post('registers')
    @HttpCode(201)
    @Public()
    @Throttle({ medium: { limit: 3, ttl: 60000 } })
    async register(@Body() registerDto: RegisterDto) {
        // Implementation for registration
    }
}
