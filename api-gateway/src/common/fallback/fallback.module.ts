import { Module } from '@nestjs/common'
import { CacheFallbackService } from './cache-fallback.service'
import { DefaultFallbackService } from './default-fallback.service'

@Module({
	providers: [DefaultFallbackService, CacheFallbackService],
	exports: [DefaultFallbackService, CacheFallbackService],
})
export class FallbackModule {}
