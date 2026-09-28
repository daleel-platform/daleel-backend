import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validate } from './env.validation.js';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? ['.env.test.local', '.env.test', '.env']
          : ['.env.local', '.env'],
      validate,
      cache: true,
    }),
  ],
})
export class AppConfigModule {}
