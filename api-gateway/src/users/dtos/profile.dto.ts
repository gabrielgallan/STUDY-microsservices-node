import { ApiProperty } from '@nestjs/swagger'
import { Role } from '../../auth/controllers/dtos/register.dto'

export class PublicUserDto {
	@ApiProperty({
		example: 'a7cd927d-de92-4af8-b16c-797bb1ec1641',
	})
	id!: string

	@ApiProperty({
		example: 'user@example.com',
	})
	email!: string

	@ApiProperty({
		example: 'John',
	})
	firstName!: string

	@ApiProperty({
		example: 'Doe',
	})
	lastName!: string

	@ApiProperty({
		example: 'seller',
		enum: ['buyer', 'seller'],
	})
	role!: Role

	@ApiProperty({
		example: 'active',
		enum: ['active', 'inactive'],
	})
	status!: string

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	createdAt!: string

	@ApiProperty({
		example: '2026-08-30T19:30:24.292Z',
	})
	updatedAt!: string
}
