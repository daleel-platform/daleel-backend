import {
  type INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js';
import { EMBEDDING_CLIENT } from '../src/modules/mentors/embedding.provider.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

interface Recommendation {
  mentor: { id: string; user: Record<string, unknown> };
  matchScore: number | null;
  matchedSkills: string[];
  rationale: string;
}
interface RecommendationBody {
  success: boolean;
  data: {
    items: Recommendation[];
    isFallback: boolean;
    semanticScoring: boolean;
  };
}

describe('Mentor recommendations (PostgreSQL e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const marker = randomUUID();
  const skillA = `skill-a-${marker}`;
  const skillB = `skill-b-${marker}`;
  const userIds: string[] = [];
  const mentorIds: Record<string, string> = {};
  let menteeToken: string;
  let emptyMenteeToken: string;
  const url = '/api/v1/mentors/recommendations';

  const sign = (sub: string) =>
    app.get(JwtService).signAsync(
      { sub },
      {
        secret: app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
        expiresIn: 900,
      },
    );
  const createUser = async (name: string, interests: string[]) => {
    const user = await prisma.user.create({
      data: {
        email: `${name}-${marker}@example.com`,
        name: `${name} ${marker}`,
        passwordHash: 'private-password',
        passwordResetTokenHash: `secret-${name}-${marker}`,
        interests,
      },
    });
    userIds.push(user.id);
    return user;
  };
  const createMentor = async (
    name: string,
    skills: string[],
    isActive = true,
    userId?: string,
  ) => {
    const owner = userId ?? (await createUser(name, [])).id;
    const profile = await prisma.mentorProfile.create({
      data: {
        userId: owner,
        headline: `${name} ${marker}`,
        about: 'Mentoring',
        skills,
        yearsOfExperience: 3,
        isActive,
      },
    });
    mentorIds[name] = profile.id;
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      // Force deterministic scoring even if a developer has HF_API_TOKEN set.
      .overrideProvider(EMBEDDING_CLIENT)
      .useValue(null)
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

    const mentee = await createUser('mentee', [skillA, skillB]);
    menteeToken = await sign(mentee.id);
    emptyMenteeToken = await sign((await createUser('empty', [])).id);

    await createMentor('perfect', [skillA.toUpperCase(), skillB]);
    await createMentor('partial', [skillA, 'Unrelated']);
    await createMentor('inactive', [skillA, skillB], false);
    // The mentee is also a mentor; they must never be recommended to themselves.
    await createMentor('self', [skillA, skillB], true, mentee.id);
  });

  afterAll(async () => {
    if (prisma)
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (app) await app.close();
  });

  it('requires authentication (and is not swallowed by GET /mentors/:id)', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
  });

  it('validates the limit', async () => {
    for (const limit of ['0', '51', 'abc', '1.5']) {
      await request(app.getHttpServer())
        .get(url)
        .query({ limit })
        .auth(menteeToken, { type: 'bearer' })
        .expect(400);
    }
  });

  it('ranks active mentors by overlap and excludes inactive mentors and the mentee', async () => {
    const res = await request(app.getHttpServer())
      .get(url)
      .query({ limit: 50 })
      .auth(menteeToken, { type: 'bearer' })
      .expect(200);
    const body = res.body as RecommendationBody;

    expect(body.success).toBe(true);
    expect(body.data.isFallback).toBe(false);
    expect(body.data.semanticScoring).toBe(false);
    const ids = body.data.items.map((item) => item.mentor.id);
    expect(ids.slice(0, 2)).toEqual([mentorIds.perfect, mentorIds.partial]);
    expect(ids).not.toContain(mentorIds.inactive);
    expect(ids).not.toContain(mentorIds.self);

    const [top, second] = body.data.items;
    expect(top.matchedSkills).toEqual([skillA.toUpperCase(), skillB]);
    expect(top.matchScore).toBeGreaterThan(second.matchScore ?? 100);
    expect(top.rationale).toContain('Shares 2 of your 2 interests');
    expect(Object.keys(top.mentor.user).sort()).toEqual([
      'avatarUrl',
      'bio',
      'name',
    ]);
    const raw = JSON.stringify(res.body);
    for (const secret of [
      'passwordHash',
      'private-password',
      'secret-',
      '"email"',
      '@example.com',
      'userId',
    ])
      expect(raw).not.toContain(secret);
  });

  it('respects the limit', async () => {
    const res = await request(app.getHttpServer())
      .get(url)
      .query({ limit: 1 })
      .auth(menteeToken, { type: 'bearer' })
      .expect(200);
    expect((res.body as RecommendationBody).data.items).toHaveLength(1);
  });

  it('falls back for a mentee without interests', async () => {
    const res = await request(app.getHttpServer())
      .get(url)
      .auth(emptyMenteeToken, { type: 'bearer' })
      .expect(200);
    const body = res.body as RecommendationBody;
    expect(body.data.isFallback).toBe(true);
    expect(body.data.items.length).toBeGreaterThan(0);
    for (const item of body.data.items) {
      expect(item.matchScore).toBeNull();
      expect(item.matchedSkills).toEqual([]);
    }
  });
});
