import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import { AppModule } from '../src/app.module'
import { CartItem } from '../src/cart/entities/cart-item.entity'
import { Cart, CartStatus } from '../src/cart/entities/cart.entity'
import { RabbitmqService } from '../src/events/rabbitmq/rabbitmq.service'
import { Order, OrderStatus } from '../src/orders/entities/order.entity'

describe('Checkout domain entities (e2e)', () => {
	let app: INestApplication
	let dataSource: DataSource
	let cartRepository: Repository<Cart>
	let cartItemRepository: Repository<CartItem>
	let orderRepository: Repository<Order>
	const cartIds = new Set<string>()
	const orderIds = new Set<string>()

	beforeAll(async () => {
		const testingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(RabbitmqService)
			.useValue({
				onModuleInit: jest.fn(),
				onModuleDestroy: jest.fn(),
				publishMessage: jest.fn(),
			})
			.compile()

		app = testingModule.createNestApplication()
		await app.init()

		dataSource = app.get(DataSource)
		cartRepository = app.get(getRepositoryToken(Cart))
		cartItemRepository = app.get(getRepositoryToken(CartItem))
		orderRepository = app.get(getRepositoryToken(Order))
	})

	afterAll(async () => {
		if (orderIds.size > 0) {
			await orderRepository.delete([...orderIds])
		}
		if (cartIds.size > 0) {
			await cartRepository.delete([...cartIds])
		}
		await app.close()
	})

	it('connects to the checkout PostgreSQL database', () => {
		expect(dataSource.isInitialized).toBe(true)
		expect(dataSource.options.type).toBe('postgres')
		expect(dataSource.options.database).toBe('checkout')
	})

	it('maps Cart exactly, including its eager cascade relation', () => {
		const metadata = cartRepository.metadata
		const columns = Object.fromEntries(
			metadata.columns.map((column) => [column.propertyName, column]),
		)

		expect(metadata.tableName).toBe('carts')
		expect(Object.keys(columns)).toEqual([
			'id',
			'userId',
			'status',
			'total',
			'createdAt',
			'updatedAt',
		])
		expect(columns.id.type).toBe('uuid')
		expect(columns.id.isPrimary).toBe(true)
		expect(columns.id.isGenerated).toBe(true)
		expect(columns.userId.type).toBe('uuid')
		expect(columns.status.type).toBe('enum')
		expect(columns.status.enum).toEqual(Object.values(CartStatus))
		expect(columns.status.default).toBe(CartStatus.ACTIVE)
		expect(columns.total.type).toBe('decimal')
		expect(columns.total.precision).toBe(10)
		expect(columns.total.scale).toBe(2)
		expect(columns.total.default).toBe(0)
		expect(columns.createdAt.isCreateDate).toBe(true)
		expect(columns.updatedAt.isUpdateDate).toBe(true)
		expect(metadata.foreignKeys).toHaveLength(0)
		expect(metadata.relations).toHaveLength(1)
		expect(metadata.relations[0]).toMatchObject({
			propertyName: 'items',
			isOneToMany: true,
			isEager: true,
			isCascadeInsert: true,
			isCascadeUpdate: true,
		})
	})

	it('maps CartItem exactly with only the Cart foreign key', () => {
		const metadata = cartItemRepository.metadata
		const columns = Object.fromEntries(
			metadata.columns.map((column) => [column.propertyName, column]),
		)

		expect(metadata.tableName).toBe('cart_items')
		expect(Object.keys(columns)).toEqual([
			'id',
			'cartId',
			'productId',
			'productName',
			'price',
			'quantity',
			'subtotal',
			'createdAt',
		])
		expect(columns.cartId.type).toBe('uuid')
		expect(columns.productId.type).toBe('uuid')
		expect(columns.productName.type).toBe('varchar')
		expect(columns.productName.length).toBe('255')
		expect(columns.price).toMatchObject({
			type: 'decimal',
			precision: 10,
			scale: 2,
		})
		expect(columns.quantity.type).toBe('int')
		expect(columns.quantity.default).toBe(1)
		expect(columns.subtotal).toMatchObject({
			type: 'decimal',
			precision: 10,
			scale: 2,
		})
		expect(columns.createdAt.isCreateDate).toBe(true)
		expect(metadata.relations).toHaveLength(1)
		expect(metadata.relations[0]).toMatchObject({
			propertyName: 'cart',
			isManyToOne: true,
			onDelete: 'CASCADE',
		})
		expect(metadata.foreignKeys).toHaveLength(1)
		expect(metadata.foreignKeys[0].columnNames).toEqual(['cartId'])
		expect(metadata.foreignKeys[0].referencedTablePath).toBe('carts')
		expect(metadata.foreignKeys[0].onDelete).toBe('CASCADE')
	})

	it('maps Order exactly without relations or foreign keys', () => {
		const metadata = orderRepository.metadata
		const columns = Object.fromEntries(
			metadata.columns.map((column) => [column.propertyName, column]),
		)

		expect(metadata.tableName).toBe('orders')
		expect(Object.keys(columns)).toEqual([
			'id',
			'userId',
			'cartId',
			'total',
			'status',
			'paymentMethod',
			'createdAt',
			'updatedAt',
		])
		expect(columns.userId.type).toBe('uuid')
		expect(columns.cartId.type).toBe('uuid')
		expect(columns.total).toMatchObject({
			type: 'decimal',
			precision: 10,
			scale: 2,
		})
		expect(columns.status.type).toBe('enum')
		expect(columns.status.enum).toEqual(Object.values(OrderStatus))
		expect(columns.status.default).toBe(OrderStatus.PENDING)
		expect(columns.paymentMethod.type).toBe('varchar')
		expect(columns.paymentMethod.length).toBe('50')
		expect(columns.createdAt.isCreateDate).toBe(true)
		expect(columns.updatedAt.isUpdateDate).toBe(true)
		expect(metadata.relations).toHaveLength(0)
		expect(metadata.foreignKeys).toHaveLength(0)
	})

	it('persists defaults, cascades items, loads them eagerly and deletes them', async () => {
		const cart = await cartRepository.save(
			cartRepository.create({
				userId: randomUUID(),
				items: [
					{
						productId: randomUUID(),
						productName: 'Checkout test product',
						price: 15.5,
						subtotal: 15.5,
					},
				],
			}),
		)
		cartIds.add(cart.id)
		const itemId = cart.items[0].id

		expect(cart.status).toBe(CartStatus.ACTIVE)
		expect(Number(cart.total)).toBe(0)
		expect(cart.items[0].quantity).toBe(1)
		expect(cart.items[0].cartId).toBe(cart.id)
		expect(cart.createdAt).toBeInstanceOf(Date)
		expect(cart.updatedAt).toBeInstanceOf(Date)

		const reloaded = await cartRepository.findOneByOrFail({ id: cart.id })
		expect(reloaded.items).toHaveLength(1)
		expect(reloaded.items[0].id).toBe(itemId)

		await cartRepository.delete(cart.id)
		cartIds.delete(cart.id)
		expect(await cartItemRepository.findOneBy({ id: itemId })).toBeNull()
	})

	it('persists the pending Order default and timestamps', async () => {
		const order = await orderRepository.save(
			orderRepository.create({
				userId: randomUUID(),
				cartId: randomUUID(),
				total: 25.75,
				paymentMethod: 'pix',
			}),
		)
		orderIds.add(order.id)

		expect(order.status).toBe(OrderStatus.PENDING)
		expect(Number(order.total)).toBe(25.75)
		expect(order.createdAt).toBeInstanceOf(Date)
		expect(order.updatedAt).toBeInstanceOf(Date)
	})
})
