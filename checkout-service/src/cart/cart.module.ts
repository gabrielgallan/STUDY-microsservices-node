import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { EnvModule } from '../env/env.module'
import { CartController } from './cart.controller'
import { CartService } from './cart.service'
import { ProductsClientService } from './clients/products-client.service'
import { CartItem } from './entities/cart-item.entity'
import { Cart } from './entities/cart.entity'

@Module({
	imports: [
		TypeOrmModule.forFeature([Cart, CartItem]),
		HttpModule.register({
			timeout: 5000,
			maxRedirects: 0,
		}),
		EnvModule,
	],
	controllers: [CartController],
	providers: [CartService, ProductsClientService],
	exports: [TypeOrmModule],
})
export class CartModule {}
