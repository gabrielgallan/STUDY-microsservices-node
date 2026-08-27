import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { PaymentsQueueService } from './payment-queue/payments-queue.service'
import { RabbitmqService } from './rabbitmq/rabbitmq.service'

@Module({
	imports: [EnvModule],
	providers: [RabbitmqService, PaymentsQueueService],
	exports: [RabbitmqService, PaymentsQueueService],
})
export class EventsModule {}
