import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service';

// BE-P02: global config module providing typed workshop configuration to any
// domain module without every module importing ConfigService directly.
@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}