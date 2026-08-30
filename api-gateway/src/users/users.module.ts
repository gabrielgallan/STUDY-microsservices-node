import { Module } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ProxyModule } from '../proxy/proxy.module'
import { UsersController } from './users.controller'

@Module({
	imports: [ProxyModule],
	controllers: [UsersController],
	providers: [JwtAuthGuard],
})
export class GatewayUsersModule {}
