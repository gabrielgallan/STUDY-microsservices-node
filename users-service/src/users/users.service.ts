import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User, UserRole, UserStatus } from './entities/user.entity'
import type { PublicUser } from './interfaces/public-user.interface'
import { toPublicUser } from './mappers/user.mapper'

@Injectable()
export class UsersService {
	constructor(
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>,
	) {}

	async getProfile(userId: string): Promise<PublicUser> {
		const user = await this.usersRepository.findOneBy({ id: userId })

		if (!user) {
			throw new UnauthorizedException()
		}

		return toPublicUser(user)
	}

	async getActiveSellers(): Promise<PublicUser[]> {
		const sellers = await this.usersRepository.findBy({
			role: UserRole.SELLER,
			status: UserStatus.ACTIVE,
		})

		return sellers.map(toPublicUser)
	}

	async getById(userId: string): Promise<PublicUser> {
		const user = await this.usersRepository.findOneBy({ id: userId })

		if (!user) {
			throw new NotFoundException('Usuário não encontrado')
		}

		return toPublicUser(user)
	}
}
