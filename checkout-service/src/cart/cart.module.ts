import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CartItem } from './entities/cart-item.entity'
import { Cart } from './entities/cart.entity'

@Module({
	imports: [TypeOrmModule.forFeature([Cart, CartItem])],
	exports: [TypeOrmModule],
})
export class CartModule {}
