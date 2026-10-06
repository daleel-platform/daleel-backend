import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { PasswordResetDeliveryService } from '../src/modules/auth/password-reset-delivery.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Password reset with PostgreSQL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = 'password-reset-' + randomUUID() + '@example.com';
  const oldPassword = 'OriginalPass1!';
  const newPassword = 'ReplacementPass2!';
  const delivery = {
    send: vi.fn().mockResolvedValue(undefined),
  };
  const base = '/api/v1/auth';

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PasswordResetDeliveryService)
      .useValue(delivery)
      .compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
    prisma = app.get(PrismaService);
    await request(app.getHttpServer())
      .post(base + '/register')
      .send({ email, name: 'Reset Test', password: oldPassword })
      .expect(201);
  });

  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { email } });
    if (app) await app.close();
  });

  async function requestToken(): Promise<string> {
    await request(app.getHttpServer())
      .post(base + '/forgot-password')
      .send({ email })
      .expect(200);
    return delivery.send.mock.lastCall![1] as string;
  }

  it('returns identical public data for known and unknown accounts', async () => {
    const known = await request(app.getHttpServer())
      .post(base + '/forgot-password')
      .send({ email })
      .expect(200);
    const unknown = await request(app.getHttpServer())
      .post(base + '/forgot-password')
      .send({ email: 'missing-' + randomUUID() + '@example.com' })
      .expect(200);
    expect(known.body.data).toEqual(unknown.body.data);
    expect(Object.keys(known.body.data)).toEqual(['message']);
  });

  it('rejects invalid email and missing reset fields', async () => {
    await request(app.getHttpServer())
      .post(base + '/forgot-password')
      .send({ email: 'invalid' })
      .expect(400);
    await request(app.getHttpServer())
      .post(base + '/reset-password')
      .send({})
      .expect(400);
  });

  it('stores a hash and rejects weak or overlong passwords without consuming the token', async () => {
    const token = await requestToken();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordResetTokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    for (const password of ['weakpass', 'Ab1!' + 'x'.repeat(69)]) {
      await request(app.getHttpServer())
        .post(base + '/reset-password')
        .send({ token, password })
        .expect(400);
    }
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(unchanged.passwordResetTokenHash).toBe(user.passwordResetTokenHash);
  });

  it('rejects unknown, expired and superseded reset tokens', async () => {
    await request(app.getHttpServer())
      .post(base + '/reset-password')
      .send({ token: 'a'.repeat(64), password: newPassword })
      .expect(400);
    const expired = await requestToken();
    await prisma.user.update({
      where: { email },
      data: { passwordResetExpiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post(base + '/reset-password')
      .send({ token: expired, password: newPassword })
      .expect(400);
    const superseded = await requestToken();
    await requestToken();
    await request(app.getHttpServer())
      .post(base + '/reset-password')
      .send({ token: superseded, password: newPassword })
      .expect(400);
  });

  it('accepts exactly one concurrent reset, rejects reuse, and changes login credentials', async () => {
    const token = await requestToken();
    const responses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(base + '/reset-password')
          .send({ token, password: newPassword }),
      ),
    );
    expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);
    await request(app.getHttpServer())
      .post(base + '/reset-password')
      .send({ token, password: oldPassword })
      .expect(400);
    await request(app.getHttpServer())
      .post(base + '/login')
      .send({ email, password: oldPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post(base + '/login')
      .send({ email, password: newPassword })
      .expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordResetTokenHash).toBeNull();
    expect(user.passwordResetExpiresAt).toBeNull();
    expect(user.passwordHash).not.toBe(newPassword);
  });
});
