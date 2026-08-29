import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { DlqController } from './dlq/dlq.controller'
import { DlqService } from './dlq/dlq.service'
import { PaymentConsumerService } from './payment-consumer/payment-consumer.service'
import { PaymentsQueueService } from './payment-queue/payments-queue.service'
import { RabbitmqService } from './rabbitmq/rabbitmq.service'
import { MetricsController } from './metrics/metrics.controller';

@Module({
	imports: [EnvModule],
	controllers: [DlqController, MetricsController],
	providers: [
		RabbitmqService,
		PaymentsQueueService,
		PaymentConsumerService,
		DlqService,
	],
	exports: [RabbitmqService, PaymentsQueueService, PaymentConsumerService, DlqService],
})
export class EventsModule {}
