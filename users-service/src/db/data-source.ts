import { DataSource, type DataSourceOptions } from 'typeorm'

import { databaseConfig } from './database.config'

export const AppDataSource = new DataSource(databaseConfig as DataSourceOptions)
