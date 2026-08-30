import { Module } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ProxyModule } from '../proxy/proxy.module'
import { ProductsController } from './products.controller'

@Module({
	imports: [ProxyModule],
	controllers: [ProductsController],
	providers: [JwtAuthGuard],
})
export class GatewayProductsModule {}
