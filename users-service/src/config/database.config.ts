import type { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { env } from '../env/env'

export const databaseConfig: TypeOrmModuleOptions = {
	type: 'postgres',
	url: env.DATABASE_URL,
	entities: [`${__dirname}/../**/*.entity{.ts,.js}`],
	synchronize: true,
}
