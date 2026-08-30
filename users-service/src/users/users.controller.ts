import { Controller, Get, Param, ParseUUIDPipe, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface'
import type { PublicUser } from './interfaces/public-user.interface'
import { UsersService } from './users.service'

type AuthenticatedRequest = Request & { user: AuthenticatedUser }

@ApiTags('Users')
@ApiBearerAuth('bearer')
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('profile')
	getProfile(@Req() request: AuthenticatedRequest): Promise<PublicUser> {
		return this.usersService.getProfile(request.user.id)
	}

	@Get('sellers')
	getActiveSellers(): Promise<PublicUser[]> {
		return this.usersService.getActiveSellers()
	}

	@Get(':id')
	getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<PublicUser> {
		return this.usersService.getById(id)
	}
}
