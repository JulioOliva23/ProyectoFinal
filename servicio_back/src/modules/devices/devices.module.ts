import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { DeviceRepository } from './repositories/device.repository';

// Device Registry: IMEI-keyed devices, commercial models and repair history.
@Module({
  controllers: [DevicesController],
  providers: [DeviceRepository, DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
