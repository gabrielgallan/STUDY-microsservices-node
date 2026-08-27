import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { env } from '../env/env'

export const databaseConfig: TypeOrmModuleOptions = {
	type: 'postgres',
	host: env.DB_HOST,
	port: env.DB_PORT,
	username: env.DB_USERNAME,
	password: env.DB_PASSWORD,
	database: env.DB_DATABASE,
	entities: [`${__dirname}/../**/*.entity{.ts,.js}`],
	synchronize: env.NODE_ENV !== 'production',
	logging: env.NODE_ENV === 'development',
}
