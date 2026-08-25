import { Module } from '@nestjs/common'
import { LoggingMiddleware } from './logging/logging.middleware'

@Module({
	imports: [],
	providers: [LoggingMiddleware],
})
export class MiddlewareModule {}
