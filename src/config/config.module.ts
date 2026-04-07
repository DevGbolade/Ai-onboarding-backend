import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, { validate } from './configuration';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
