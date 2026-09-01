import {
	Controller,
	Get,
	Headers,
	HttpCode,
	HttpStatus,
	Req,
	UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ApiExceptionResponseDto } from '../dtos/api-exeption-response.dto'
import { ProxyService } from '../proxy/service/proxy.service'
import { GetActiveSellersResponseDto } from './dtos/get-active-sellers.dto'
import { GetProfileResponseDto } from './dtos/get-profile.dto'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get('profile')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'Get the authenticated user profile' })
	@ApiResponse({
		status: 200,
		description: 'Profile of the authenticated user',
		type: GetProfileResponseDto,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 404,
		description: 'User not found',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	getProfile(
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'users',
			'get',
			'/users/profile',
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}

	@Get('sellers')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({ summary: 'List active sellers' })
	@ApiResponse({
		status: 200,
		description: 'Active sellers',
		type: GetActiveSellersResponseDto,
		isArray: true,
	})
	@ApiResponse({
		status: 401,
		description: 'Missing, invalid or expired token',
		type: ApiExceptionResponseDto,
	})
	@ApiResponse({
		status: 429,
		description: 'Too many requests',
		type: ApiExceptionResponseDto,
	})
	getActiveSellers(
		@Headers('authorization') authorization: string,
		@Req() request: AuthenticatedRequest,
	) {
		return this.proxyService.proxyRequest(
			'users',
			'get',
			'/users/sellers',
			undefined,
			{ Authorization: authorization },
			request.user,
		)
	}
}
