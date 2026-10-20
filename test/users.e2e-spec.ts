import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let accessToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
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

    // Clean up test data if any
    await prisma.user.deleteMany({
      where: { email: { contains: 'e2e-test' } },
    });

    // Seed test user
    const user = await prisma.user.create({
      data: {
        email: 'e2e-test-user@example.com',
        name: 'E2E Test User',
        passwordHash: 'secret-hash-do-not-leak',
        bio: 'Hello from E2E test',
        interests: ['Vitest', 'NestJS'],
      },
    });
    testUserId = user.id;

    accessToken = await app.get(JwtService).signAsync(
      { sub: testUserId },
      {
        secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
        expiresIn: 900,
      },
    );
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { email: { contains: 'e2e-test' } },
      });
    }
    if (app) {
      await app.close();
    }
  });

  describe('GET /api/v1/users/me', () => {
    it('should return 401 when the bearer token is missing', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid access token');
    });

    it('should return current user profile and NEVER leak passwordHash', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data.email).toBe('e2e-test-user@example.com');
      expect(response.body.data.name).toBe('E2E Test User');
      expect(response.body.data.interests).toEqual(['Vitest', 'NestJS']);
      // Verify security: passwordHash MUST NOT be exposed
      expect(response.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('should return 400 when id is not a valid UUID', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/not-a-uuid')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 when user is not found', async () => {
      const nonExistentUuid = '00000000-0000-0000-0000-000000000000';
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${nonExistentUuid}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return user profile when found', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/users/${testUserId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testUserId);
      expect(response.body.data.name).toBe('E2E Test User');
      expect(response.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/users/me', () => {
    it('should update user profile successfully', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .auth(accessToken, { type: 'bearer' })
        .send({
          name: 'Updated Name',
          bio: 'Updated Bio',
          interests: ['TypeScript'],
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.bio).toBe('Updated Bio');
      expect(response.body.data.interests).toEqual(['TypeScript']);
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('should reject unwhitelisted fields like passwordHash or email with 400', async () => {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .auth(accessToken, { type: 'bearer' })
        .send({
          passwordHash: 'hacked-password',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      const messages = Array.isArray(response.body.message)
        ? response.body.message
        : [response.body.message];
      expect(
        messages.some((msg: string) =>
          msg.includes('property passwordHash should not exist'),
        ),
      ).toBe(true);
    });
  });
});
