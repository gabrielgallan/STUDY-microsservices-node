import { Module } from '@nestjs/common'
import { TimeoutService } from './timeout.service'

@Module({
	imports: [],
	providers: [TimeoutService],
	exports: [TimeoutService],
})
export class TimeoutModule {}
