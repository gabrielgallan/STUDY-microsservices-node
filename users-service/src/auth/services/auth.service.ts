import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import { compare, hash } from 'bcryptjs'
import { QueryFailedError, Repository } from 'typeorm'
import { User, UserStatus } from '../../users/entities/user.entity'
import type { LoginInput } from '../controllers/dtos/login.dto'
import type { RegisterInput } from '../controllers/dtos/register.dto'
import type { JwtPayload } from '../interfaces/jwt-payload.interface'
import type { LoginResponse } from '../interfaces/login-response.interface'
import type { PublicUser } from '../interfaces/public-user.interface'

const BCRYPT_SALT_ROUNDS = 10
const POSTGRES_UNIQUE_VIOLATION = '23505'

@Injectable()
export class AuthService {
	constructor(
		@InjectRepository(User)
		private readonly usersRepository: Repository<User>,
		private readonly jwtService: JwtService,
	) {}

	async login(input: LoginInput): Promise<LoginResponse> {
		const user = await this.findUserByEmail(input.email)

		if (!user) {
			throw new UnauthorizedException('Credenciais inválidas')
		}

		const passwordMatches = await compare(input.password, user.password)

		if (!passwordMatches) {
			throw new UnauthorizedException('Credenciais inválidas')
		}

		if (user.status !== UserStatus.ACTIVE) {
			throw new UnauthorizedException('Conta inativa')
		}

		const payload: JwtPayload = {
			sub: user.id,
			email: user.email,
			role: user.role,
		}
		const token = await this.jwtService.signAsync(payload)

		return {
			user: this.toPublicUser(user),
			token,
		}
	}

	async register(input: RegisterInput): Promise<PublicUser> {
		const existingUser = await this.findUserByEmail(input.email)

		if (existingUser) {
			throw new ConflictException('Email already registered')
		}

		const passwordHash = await hash(input.password, BCRYPT_SALT_ROUNDS)
		const user = this.usersRepository.create({
			email: input.email,
			password: passwordHash,
			firstName: input.firstName,
			lastName: input.lastName,
			role: input.role,
			status: UserStatus.ACTIVE,
		})

		try {
			const savedUser = await this.usersRepository.save(user)

			return this.toPublicUser(savedUser)
		} catch (error) {
			if (this.isUniqueViolation(error)) {
				throw new ConflictException('Email already registered')
			}

			throw error
		}
	}

	private findUserByEmail(email: string): Promise<User | null> {
		return this.usersRepository
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email })
			.getOne()
	}

	private isUniqueViolation(error: unknown): boolean {
		if (!(error instanceof QueryFailedError)) {
			return false
		}

		const driverError = error.driverError as { code?: string }

		return driverError.code === POSTGRES_UNIQUE_VIOLATION
	}

	private toPublicUser(user: User): PublicUser {
		return {
			id: user.id,
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
			role: user.role,
			status: user.status,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
		}
	}
}
