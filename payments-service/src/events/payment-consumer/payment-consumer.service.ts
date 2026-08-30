import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PaymentsService } from '../../payments/payments.service'
import {
	PaymentOrderMessage,
	publishedPaymentOrderMessageSchema,
} from '../payment-queue/payment-queue.interface'
import { PaymentsQueueService } from '../payment-queue/payments-queue.service'
import { RabbitmqService } from '../rabbitmq/rabbitmq.service'

export interface ConsumerMetrics {
	totalProcessed: number // Total de mensagens processadas
	totalSuccess: number // Mensagens processadas com sucesso
	totalFailed: number // Mensagens que falharam
	totalRetries: number // Total de tentativas de retry
	lastProcessedAt: Date | null // Timestamp do último processamento
	startedAt: Date // Quando o consumer iniciou
	averageProcessingTime: number // Tempo médio de processamento em ms
}

@Injectable()
export class PaymentConsumerService implements OnModuleInit {
	/**
	 * ============================================
	 * MÉTRICAS DE MONITORAMENTO
	 * ============================================
	 * Armazena estatísticas de processamento em memória
	 * Em produção, usaríamos Prometheus, DataDog, etc.
	 */

	private metrics: ConsumerMetrics = {
		totalProcessed: 0,
		totalSuccess: 0,
		totalFailed: 0,
		totalRetries: 0,
		lastProcessedAt: null,
		startedAt: new Date(),
		averageProcessingTime: 0,
	}

	private totalProcessingTime = 0

	private logger = new Logger(PaymentConsumerService.name)

	constructor(
		private paymentsQueueService: PaymentsQueueService,
		private rabbitmq: RabbitmqService,
		private paymentsService: PaymentsService,
	) {}

	async onModuleInit() {
		this.logger.log('Initializing Payment Consumer Service')

		await this.startConsuming()

		this.metrics.startedAt = new Date()
	}

	async startConsuming() {
		try {
			this.logger.log('Starting to consume payment orders from queue')

			const isConnected = await this.rabbitmq.waitForConnection()

			if (!isConnected) {
				this.logger.error('Could not connect to RabbitMQ after multiple attempts')
				return
			}

			await this.paymentsQueueService.consumePaymentOrder(
				this.processPaymentOrder.bind(this),
			)

			this.logger.log('Payment Consumer Service started successfully')
		} catch (error) {
			this.logger.error('Failed to start consuming payment orders:', error)
		}
	}

	private async processPaymentOrder(message: PaymentOrderMessage) {
		const startTime = Date.now()

		try {
			const result = publishedPaymentOrderMessageSchema.safeParse(message)

			if (!result.success) {
				this.logger.error('Invalid payment message received')
				throw new Error('Invalid payment message')
			}

			const paymentOrder = result.data

			this.logger.log(
				`Processing payment order: ` +
					`orderId=${paymentOrder.orderId}, ` +
					`userId=${paymentOrder.userId}, ` +
					`amount=${paymentOrder.amount}`,
			)

			const payment = await this.paymentsService.processPayment(paymentOrder)

			/**
			 * A rejected payment is a completed processing, not a failure: it must
			 * not throw, otherwise every declined charge would be retried and end
			 * up in the dead-letter queue.
			 */
			this.logger.log(
				`Payment ${payment.id} for order ${paymentOrder.orderId} finished with status ${payment.status}`,
			)

			this.updateMetrics(true, startTime)
		} catch (error) {
			this.logger.error(
				`Failed to process payment for order ${message.orderId}:`,
				error,
			)

			this.updateMetrics(false, startTime)

			throw error
		}
	}

	private updateMetrics(success: boolean, startTime: number): void {
		const processingTime = Date.now() - startTime

		this.metrics.totalProcessed++

		this.metrics.lastProcessedAt = new Date()

		if (success) {
			this.metrics.totalSuccess++
		} else {
			this.metrics.totalFailed++
		}

		this.totalProcessingTime += processingTime

		this.metrics.averageProcessingTime = Math.round(
			this.totalProcessingTime / this.metrics.totalProcessed,
		)

		if (this.metrics.totalProcessed % 10 === 0) {
			this.logMetricsSummary()
		}
	}

	incrementRetryCount(): void {
		this.metrics.totalRetries++
	}

	private logMetricsSummary(): void {
		const successRate =
			this.metrics.totalProcessed > 0
				? ((this.metrics.totalSuccess / this.metrics.totalProcessed) * 100).toFixed(2)
				: '0'

		this.logger.log('====== CONSUMER METRICS ======')
		this.logger.log(`.   Total Processed: ${this.metrics.totalProcessed}`)
		this.logger.log(`.   Success: ${this.metrics.totalSuccess}`)
		this.logger.log(`.   Failed: ${this.metrics.totalFailed}`)
		this.logger.log(`.   Retries: ${this.metrics.totalRetries}`)
		this.logger.log(`.   Success Rate: ${successRate}%`)
		this.logger.log(`.   Avg Processing Time: ${this.metrics.averageProcessingTime}ms`)
		this.logger.log('================================')
	}

	getMetrics(): ConsumerMetrics {
		return { ...this.metrics }
	}

	resetMetrics(): void {
		this.metrics = {
			totalProcessed: 0,
			totalSuccess: 0,
			totalFailed: 0,
			totalRetries: 0,
			lastProcessedAt: null,
			startedAt: new Date(),
			averageProcessingTime: 0,
		}
		this.totalProcessingTime = 0

		this.logger.log('Metrics reset')
	}
}
