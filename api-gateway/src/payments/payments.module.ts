import { Module } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ProxyModule } from '../proxy/proxy.module'
import { PaymentsProxyController } from './payments.controller'

@Module({
	imports: [ProxyModule],
	controllers: [PaymentsProxyController],
	providers: [JwtAuthGuard],
})
export class PaymentsModule {}
