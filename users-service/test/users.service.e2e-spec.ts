import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity'
import { UsersService } from '../src/users/users.service'

describe('UsersService', () => {
	it('returns an empty seller list when no records match', async () => {
		const findBy = jest.fn().mockResolvedValue([])
		const testingModule = await Test.createTestingModule({
			providers: [
				UsersService,
				{
					provide: getRepositoryToken(User),
					useValue: { findBy },
				},
			],
		}).compile()
		const usersService = testingModule.get(UsersService)

		await expect(usersService.getActiveSellers()).resolves.toEqual([])
		expect(findBy).toHaveBeenCalledWith({
			role: UserRole.SELLER,
			status: UserStatus.ACTIVE,
		})
	})
})
