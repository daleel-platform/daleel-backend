import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter.js';
import { join } from 'node:path';
import { MailService } from './mail.service.js';
import { Environment } from '../../config/env.validation.js';

@Module({
  imports: [
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const environment = config.get<Environment>(
          'NODE_ENV',
          Environment.Development,
        );

        const host = config.get<string>('SMTP_HOST');
        const port = config.get<number>('SMTP_PORT');
        const user = config.get<string>('SMTP_USER');
        const password = config.get<string>('SMTP_PASSWORD');
        const from = config.get<string>('SMTP_FROM');

        const smtpConfigured =
          Boolean(host) &&
          port !== undefined &&
          Boolean(user) &&
          Boolean(password) &&
          Boolean(from);

        if (environment === Environment.Production && !smtpConfigured) {
          throw new Error('SMTP configuration is required in production');
        }

        const transport = smtpConfigured
          ? {
              host,
              port,
              secure: port === 465,
              auth: {
                user,
                pass: password,
              },
            }
          : {
              jsonTransport: true,
            };

        return {
          transport,
          defaults: {
            from: from ?? 'Daleel <no-reply@localhost>',
          },
          template: {
            dir: join(import.meta.dirname, 'templates'),
            adapter: new HandlebarsAdapter(),
            options: {
              strict: true,
            },
          },
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
