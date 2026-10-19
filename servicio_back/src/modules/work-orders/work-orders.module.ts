import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module';
import { UsersModule } from '../users/users.module';
import { WorkOrderTransitionsModule } from './work-order-transitions.module';
import { PublicTrackingController } from './public-tracking.controller';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [WorkOrderTransitionsModule, DevicesModule, UsersModule],
  controllers: [WorkOrdersController, PublicTrackingController],
  providers: [WorkOrdersService],
})
export class WorkOrdersModule {}
