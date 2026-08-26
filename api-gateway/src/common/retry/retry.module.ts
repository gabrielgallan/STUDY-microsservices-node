import { Module } from '@nestjs/common'
import { RetryService } from './retry.service'

@Module({
	imports: [],
	providers: [RetryService],
	exports: [RetryService],
})
export class RetryModule {}
