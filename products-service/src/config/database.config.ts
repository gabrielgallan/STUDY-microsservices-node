import type { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { env } from '../env/env'

export const databaseConfig: TypeOrmModuleOptions = {
	type: 'postgres',
	url: env.DATABASE_URL,
	logging: env.NODE_ENV === 'development',

	synchronize: false,
	entities: [`${__dirname}/../**/*.entity{.ts,.js}`],
	migrations: [`${__dirname}/../migrations/*.{js,ts}`],

	migrationsRun: true,
	migrationsTableName: 'migrations',
}
