import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../../common/interceptors/response.interceptor.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const authService = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
  };
  const session = {
    accessToken: 'access.jwt.token',
    refreshToken: 'refresh.jwt.token',
    expiresIn: 900,
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: null,
      bio: null,
      interests: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      passwordHash: 'must-not-be-returned',
      mentorProfile: null,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: { get: () => 'test' } },
      ],
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
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers and returns an access token with a protected refresh cookie', async () => {
    authService.register.mockResolvedValue(session);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass1!',
      })
      .expect(201);

    expect(authService.register).toHaveBeenCalled();
    expect(response.body.data.accessToken).toBe(session.accessToken);
    expect(response.body.data.refreshToken).toBeUndefined();
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(response.headers['set-cookie'][0]).toContain(
      'refreshToken=refresh.jwt.token',
    );
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    expect(response.headers['set-cookie'][0]).toMatch(/SameSite=Strict/i);
  });

  it('rejects passwords that do not meet registration complexity rules', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'weakpass',
      })
      .expect(400);

    expect(authService.register).not.toHaveBeenCalled();
  });

  it('logs in and stores the refresh token in a cookie', async () => {
    authService.login.mockResolvedValue(session);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass1!' })
      .expect(200);

    expect(response.body.data.accessToken).toBe(session.accessToken);
    expect(response.headers['set-cookie'][0]).toContain(
      'refreshToken=refresh.jwt.token',
    );
  });

  it('returns unauthorized for invalid login credentials', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'SecurePass1!' })
      .expect(401);

    expect(response.body.message).toBe('Invalid email or password');
  });

  it('refreshes tokens from the refresh cookie', async () => {
    authService.refresh.mockResolvedValue(session);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=presented-refresh-token')
      .expect(200);

    expect(authService.refresh).toHaveBeenCalledWith('presented-refresh-token');
    expect(response.body.data.accessToken).toBe(session.accessToken);
    expect(response.headers['set-cookie'][0]).toContain(
      'refreshToken=refresh.jwt.token',
    );
  });

  it('returns unauthorized when the refresh cookie is missing', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(401);

    expect(authService.refresh).not.toHaveBeenCalled();
  });
});
