import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UnlockCodeCipher } from './unlock-code-cipher';

// RN-03: single cipher instance keyed from UNLOCK_CODE_ENCRYPTION_KEY
// (validated at bootstrap by the Joi schema, BE-30).
@Global()
@Module({
  providers: [
    {
      provide: UnlockCodeCipher,
      useFactory: (config: ConfigService) => new UnlockCodeCipher(config.getOrThrow<string>('UNLOCK_CODE_ENCRYPTION_KEY')),
      inject: [ConfigService],
    },
  ],
  exports: [UnlockCodeCipher],
})
export class CryptoModule {}
