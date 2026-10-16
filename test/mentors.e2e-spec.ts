import { vi } from 'vitest';
import { StorageService } from '../src/modules/storage/storage.service.js';
import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';

describe('Mentors (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = randomUUID();
  const ids: string[] = [];
  const tokens: string[] = [];
  let mentorId: string;
  const storage = {
    uploadFile: vi.fn(),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  };
  const base = '/api/v1/mentors';
  const dto = {
    headline: 'NestJS ' + marker,
    about: 'Teaching backend development',
    skills: ['NestJS', marker],
    yearsOfExperience: 5,
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    for (let i = 0; i < 3; i++) {
      const user = await prisma.user.create({
        data: {
          email: `mentor-${marker}-${i}@example.com`,
          name: `Mentor ${marker} ${i}`,
          passwordHash: 'private-password',
          passwordResetTokenHash: `secret-${marker}-${i}`,
        },
      });
      ids.push(user.id);
      tokens.push(
        await app.get(JwtService).signAsync(
          { sub: user.id },
          {
            secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
            expiresIn: 900,
          },
        ),
      );
    }
  });
  afterAll(async () => {
    if (prisma) await prisma.user.deleteMany({ where: { id: { in: ids } } });
    if (app) await app.close();
  });
  it('protects all writes and validates creation input', async () => {
    await request(app.getHttpServer()).post(base).send(dto).expect(401);
    await request(app.getHttpServer())
      .patch(base + '/me')
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .patch(base + '/me/status')
      .send({ isActive: false })
      .expect(401);
    for (const invalid of [
      {},
      { ...dto, headline: ' ' },
      { ...dto, skills: [42] },
      { ...dto, skills: [' '] },
      { ...dto, yearsOfExperience: -1 },
      { ...dto, yearsOfExperience: 1.5 },
      { ...dto, linkedinUrl: 'bad' },
      { ...dto, userId: ids[1] },
      { ...dto, isActive: false },
    ]) {
      await request(app.getHttpServer())
        .post(base)
        .auth(tokens[0], { type: 'bearer' })
        .send(invalid)
        .expect(400);
    }
  });
  it('allows exactly one concurrent profile creation and exposes only public user data', async () => {
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post(base)
          .auth(tokens[0], { type: 'bearer' })
          .send(dto),
      ),
    );
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const data = results.find((r) => r.status === 201)!.body.data;
    mentorId = data.id;
    expect(data.user).toEqual({
      name: `Mentor ${marker} 0`,
      avatarUrl: null,
      bio: null,
    });
    expect(data.userId).toBeUndefined();
    const response = await request(app.getHttpServer())
      .get(base + '/' + mentorId)
      .expect(200);
    expect(response.body.data).toEqual(data);
  });
  it('restricts updates to the current user and returns 404 for missing profiles', async () => {
    await request(app.getHttpServer())
      .patch(base + '/me')
      .auth(tokens[1], { type: 'bearer' })
      .send({ headline: 'Not mine' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(base + '/me/status')
      .auth(tokens[1], { type: 'bearer' })
      .send({ isActive: false })
      .expect(404);
    await request(app.getHttpServer())
      .patch(base + '/me')
      .auth(tokens[0], { type: 'bearer' })
      .send({ userId: ids[1] })
      .expect(400);
    await request(app.getHttpServer())
      .patch(base + '/me')
      .auth(tokens[0], { type: 'bearer' })
      .send({ headline: null })
      .expect(400);
    const response = await request(app.getHttpServer())
      .patch(base + '/me')
      .auth(tokens[0], { type: 'bearer' })
      .send({ about: 'Updated about' })
      .expect(200);
    expect(response.body.data.about).toBe('Updated about');
    expect(response.body.data.headline).toBe(dto.headline);
  });
  it('hides inactive mentors and supports explicit reactivation', async () => {
    await request(app.getHttpServer())
      .patch(base + '/me/status')
      .auth(tokens[0], { type: 'bearer' })
      .send({ isActive: 'false' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(base + '/me/status')
      .auth(tokens[0], { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .get(base + '/' + mentorId)
      .expect(404);
    const response = await request(app.getHttpServer())
      .get(base)
      .query({ search: marker })
      .expect(200);
    expect(response.body.data.items).toEqual([]);
    await request(app.getHttpServer())
      .patch(base + '/me/status')
      .auth(tokens[0], { type: 'bearer' })
      .send({ isActive: true })
      .expect(200);
  });
  it('filters by any skill, experience, and case-insensitive name/headline with stable pagination', async () => {
    await request(app.getHttpServer())
      .post(base)
      .auth(tokens[1], { type: 'bearer' })
      .send({
        ...dto,
        headline: 'Frontend',
        skills: ['React', marker],
        yearsOfExperience: 2,
      })
      .expect(201);
    const first = await request(app.getHttpServer())
      .get(base)
      .query({ search: marker, page: 1, limit: 1 })
      .expect(200);
    expect(first.body.data.meta).toEqual({
      totalItems: 2,
      itemCount: 1,
      itemsPerPage: 1,
      totalPages: 2,
      currentPage: 1,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    expect(Object.keys(first.body.data.items[0].user).sort()).toEqual([
      'avatarUrl',
      'bio',
      'name',
    ]);
    const second = await request(app.getHttpServer())
      .get(base)
      .query({ search: marker, page: 2, limit: 1 })
      .expect(200);
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);
    const filtered = await request(app.getHttpServer())
      .get(base)
      .query({
        search: marker.toUpperCase(),
        skills: ['Unknown', 'NestJS'],
        minExperience: 3,
      })
      .expect(200);
    expect(
      filtered.body.data.items.map((item: { id: string }) => item.id),
    ).toEqual([mentorId]);
    const byHeadline = await request(app.getHttpServer())
      .get(base)
      .query({ search: 'nestjs ' + marker, skills: marker })
      .expect(200);
    expect(byHeadline.body.data.meta.totalItems).toBe(1);
    const beyond = await request(app.getHttpServer())
      .get(base)
      .query({ search: marker, page: 99 })
      .expect(200);
    expect(beyond.body.data.items).toEqual([]);
    expect(beyond.body.data.meta.totalItems).toBe(2);
    const defaults = await request(app.getHttpServer())
      .get(base)
      .query({ search: marker })
      .expect(200);
    expect(defaults.body.data.meta).toMatchObject({
      currentPage: 1,
      itemsPerPage: 10,
    });
  });
  it('rejects bad pagination and unknown/private filters; missing IDs return 404', async () => {
    for (const query of [
      { page: '0' },
      { page: '1.5' },
      { page: 'abc' },
      { limit: '51' },
      { limit: '0' },
      { minExperience: '-1' },
      { isActive: 'false' },
      { search: ' ' },
    ]) {
      await request(app.getHttpServer()).get(base).query(query).expect(400);
    }
    await request(app.getHttpServer())
      .get(base + '/invalid')
      .expect(400);
    await request(app.getHttpServer())
      .get(base + '/' + randomUUID())
      .expect(404);
  });
  it('uploads for authenticated users including non-mentors and saves only their avatar', async () => {
    const path = '/api/v1/users/me/avatar';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
      'base64',
    );
    await request(app.getHttpServer())
      .post(path)
      .attach('file', png, 'avatar.png')
      .expect(401);
    await request(app.getHttpServer())
      .post(path)
      .auth(tokens[0], { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .post(path)
      .auth(tokens[0], { type: 'bearer' })
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'test.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);
    storage.uploadFile.mockResolvedValue({
      publicId: 'daleel/avatars/test-' + marker,
      url: 'https://res.cloudinary.com/demo/image/upload/avatar.png',
    });
    const result = await request(app.getHttpServer())
      .post(path)
      .auth(tokens[0], { type: 'bearer' })
      .attach('file', png, 'avatar.png')
      .expect(200);
    expect(result.body.data.avatarUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/avatar.png',
    );
    expect(result.body.data.avatarPublicId).toBeUndefined();
    const owner = await prisma.user.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    expect(owner.avatarPublicId).toBe('daleel/avatars/test-' + marker);
    const other = await prisma.user.findUniqueOrThrow({
      where: { id: ids[1] },
    });
    expect(other.avatarUrl).toBeNull();
    const nonMentor = await request(app.getHttpServer())
      .post(path)
      .auth(tokens[2], { type: 'bearer' })
      .attach('file', png, 'avatar.png')
      .expect(200);
    expect(Object.keys(nonMentor.body.data)).toEqual(['avatarUrl']);
    expect(
      await prisma.mentorProfile.count({ where: { userId: ids[2] } }),
    ).toBe(0);
    const unchangedOwner = await prisma.user.findUniqueOrThrow({
      where: { id: ids[0] },
    });
    expect(unchangedOwner.avatarUrl).toBe(owner.avatarUrl);
  });
  it('creates the profile and photo together and rolls back a concurrent avatar conflict', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=',
      'base64',
    );
    const submit = () =>
      request(app.getHttpServer())
        .post(base)
        .auth(tokens[2], { type: 'bearer' })
        .field('headline', 'Mentor with photo')
        .field('about', 'Teaching backend development')
        .field('skills', 'NestJS,TypeScript')
        .field('yearsOfExperience', '2')
        .attach('file', png, 'avatar.png');
    storage.uploadFile.mockRejectedValueOnce(new Error('Upload failed'));
    await submit().expect(500);
    expect(
      await prisma.mentorProfile.count({ where: { userId: ids[2] } }),
    ).toBe(0);
    storage.uploadFile.mockImplementationOnce(async () => {
      await prisma.user.update({
        where: { id: ids[2] },
        data: { avatarUrl: 'https://example.com/concurrent.png' },
      });
      return {
        publicId: 'daleel/avatars/loser',
        url: 'https://example.com/loser.png',
      };
    });
    await submit().expect(409);
    expect(
      await prisma.mentorProfile.count({ where: { userId: ids[2] } }),
    ).toBe(0);
    expect(storage.deleteFile).toHaveBeenCalledWith(
      'daleel/avatars/loser',
      expect.any(Object),
    );
    storage.uploadFile.mockResolvedValue({
      publicId: 'daleel/avatars/created',
      url: 'https://example.com/created.png',
    });
    const response = await submit().expect(201);
    expect(response.body.data.skills).toEqual(['NestJS', 'TypeScript']);
    expect(response.body.data.yearsOfExperience).toBe(2);
    expect(response.body.data.user.avatarUrl).toBe(
      'https://example.com/created.png',
    );
    const calls = storage.uploadFile.mock.calls.length;
    await submit().expect(409);
    expect(storage.uploadFile).toHaveBeenCalledTimes(calls);
  });
});
