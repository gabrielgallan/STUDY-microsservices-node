import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as amqp from 'amqplib'
import { EnvService } from '../../env/env.service'

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
	private logger = new Logger(RabbitmqService.name)
	private connection: amqp.ChannelModel | undefined
	private channel: amqp.Channel | undefined

	constructor(private env: EnvService) {}

	async onModuleInit() {
		const rabbitmqUrl = this.env.get('RABBITMQ_URL')

		try {
			this.connection = await amqp.connect(rabbitmqUrl)

			this.channel = await this.connection.createChannel()

			this.logger.log('Connected to RabbitMQ!')

			this.channel.on('error', (error) => {
				this.logger.error('RabbitMQ channel error', error)
			})

			this.channel.on('close', () => {
				this.logger.warn('RabbitMQ channel closed')
			})
		} catch (error: unknown) {
			this.logger.error('Failed to connect to RabbitMQ', error)
		}
	}

	async onModuleDestroy() {
		try {
			if (this.channel) {
				await this.channel.close()
				this.logger.log('RabbitMQ channel closed')
			}

			if (this.connection) {
				await this.connection.close()
				this.logger.log('RabbitMQ connection closed')
			}
		} catch (error) {
			this.logger.error('Error disconnecting from RabbitMQ:', error)
		}
	}

	getChannel(): amqp.Channel | undefined {
		return this.channel
	}

	getConnection(): amqp.ChannelModel | undefined {
		return this.connection
	}

	async publishMessage(
		exchange: string,
		routingKey: string,
		message: any,
	): Promise<void> {
		try {
			const channel = this.getChannel()

			if (!channel) {
				this.logger.warn('RabbitMQ channel is not available')
				return
			}

			await channel.assertExchange(exchange, 'topic', { durable: true })

			const messageBuffer = Buffer.from(JSON.stringify(message))

			const published = channel.publish(exchange, routingKey, messageBuffer, {
				persistent: true,
				timestamp: Date.now(),
				contentType: 'application/json',
			})

			if (!published) {
				this.logger.warn('Failed to publish message to RabbitMQ')
			}

			this.logger.log(
				`Message published to exchange "${exchange}" with routing key "${routingKey}"`,
			)
		} catch (error: unknown) {
			this.logger.error('Error publishing message to RabbitMQ:', error)
		}
	}

	async subscribeToQueue(
		queueName: string,
		exchange: string,
		routingKey: string,
		onMessage: (msg: amqp.ConsumeMessage | null) => Promise<void>,
	): Promise<void> {
		try {
			const channel = this.getChannel()

			if (!channel) {
				this.logger.warn('RabbitMQ channel is not available')

				return
			}

			await channel.assertExchange(exchange, 'topic', { durable: true })

			const queue = await channel.assertQueue(queueName, {
				durable: true,
				arguments: {
					'x-message-ttl': 8640000, // 24 hours in milliseconds
					'x-max-length': 10000,
				},
			})

			await channel.bindQueue(queue.queue, exchange, routingKey)

			await channel.prefetch(1)

			await channel.consume(
				queue.queue,
				async (msg) => {
					if (msg) {
						try {
							const message = JSON.parse(msg.content.toString())

							this.logger.log(
								`Received message from queue "${queueName}" with routing key "${routingKey}": ${JSON.stringify(
									message,
								)}`,
							)

							await onMessage(msg)

							channel.ack(msg)

							this.logger.log(
								`Acknowledged message from queue "${queueName}" with routing key "${routingKey}"`,
							)
						} catch {
							this.logger.error(
								`Error processing message from queue "${queueName}" with routing key "${routingKey}"`,
							)

							channel.nack(msg, false, false) // Reject the message and do not requeue
						}
					}
				},
				{ noAck: false },
			)
		} catch (error: unknown) {
			this.logger.error('Error subscribing to RabbitMQ queue:', error)
		}
	}
}
