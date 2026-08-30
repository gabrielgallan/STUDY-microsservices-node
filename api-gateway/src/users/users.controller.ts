import { Controller, Get, Headers, Req, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { UserPayload } from '../auth/strategies/jwt.strategy'
import { ProxyService } from '../proxy/service/proxy.service'

type AuthenticatedRequest = Request & { user: UserPayload }

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
	constructor(private readonly proxyService: ProxyService) {}

	@Get('profile')
	@ApiOperation({ summary: 'Get the authenticated user profile' })
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
	@ApiOperation({ summary: 'List active sellers' })
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
