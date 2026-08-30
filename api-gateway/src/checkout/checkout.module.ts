import { Module } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ProxyModule } from '../proxy/proxy.module'
import { CartProxyController } from './cart.controller'
import { OrdersProxyController } from './orders.controller'

@Module({
	imports: [ProxyModule],
	controllers: [CartProxyController, OrdersProxyController],
	providers: [JwtAuthGuard],
})
export class CheckoutModule {}
