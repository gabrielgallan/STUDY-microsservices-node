import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { CircuitBreakerModule } from '../common/circuit-breaker/circuit-breaker.module'
import { FallbackModule } from '../common/fallback/fallback.module'
import { RetryModule } from '../common/retry/retry.module'
import { TimeoutModule } from '../common/timeout/timeout.module'
import { ProxyService } from './service/proxy.service'

@Module({
	imports: [
		HttpModule,
		CircuitBreakerModule,
		FallbackModule,
		TimeoutModule,
		RetryModule,
	],
	providers: [ProxyService],
	exports: [ProxyService],
})
export class ProxyModule {}
