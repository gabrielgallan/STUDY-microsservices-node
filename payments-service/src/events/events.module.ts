import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { PaymentConsumerService } from './payment-consumer/payment-consumer.service'
import { PaymentsQueueService } from './payment-queue/payments-queue.service'
import { RabbitmqService } from './rabbitmq/rabbitmq.service'

@Module({
	imports: [EnvModule],
	providers: [RabbitmqService, PaymentsQueueService, PaymentConsumerService],
	exports: [RabbitmqService, PaymentsQueueService, PaymentConsumerService],
})
export class EventsModule {}
