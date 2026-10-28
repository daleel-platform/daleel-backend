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
import {
  EMBEDDING_CLIENT,
  type EmbeddingClient,
} from '../src/modules/mentors/embedding.provider.js';
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

/**
 * Stand-in for the real model (which would need a download): texts mentioning
 * "design" point one way, "cooking" another, everything else a third.
 */
const fakeModel: EmbeddingClient = {
  model: 'fake/keyword-model',
  embed: (texts) =>
    Promise.resolve(
      texts.map((text) => {
        const t = text.toLowerCase();
        return [
          t.includes('design') ? 1 : 0,
          t.includes('cooking') ? 1 : 0,
          0.1,
        ];
      }),
    ),
};

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
      .overrideProvider(EMBEDDING_CLIENT)
      .useValue(fakeModel)
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
    expect(body.data.semanticScoring).toBe(true);
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
      'embedding',
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
  it('stores a vector when a profile is saved and uses it to rank by meaning', async () => {
    const designer = await createUser('designer', []);
    const cook = await createUser('cook', []);
    const create = async (token: string, about: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/mentors')
        .auth(token, { type: 'bearer' })
        .send({
          headline: `Mentor ${marker}`,
          about,
          skills: ['Figma'],
          yearsOfExperience: 3,
        })
        .expect(201);
      return (res.body as { data: { id: string } }).data.id;
    };
    const designerId = await create(await sign(designer.id), 'I teach cooking');
    const cookId = await create(await sign(cook.id), 'Home cooking classes');

    // Editing the profile re-embeds it: the designer now talks about design.
    await request(app.getHttpServer())
      .patch('/api/v1/mentors/me')
      .auth(await sign(designer.id), { type: 'bearer' })
      .send({ about: 'I teach product design' })
      .expect(200);

    const stored = await prisma.mentorProfile.findUniqueOrThrow({
      where: { id: designerId },
    });
    expect(stored.embeddingModel).toBe('fake/keyword-model');
    expect(stored.embedding).toEqual([1, 0, 0.1]);

    // No skill overlap with either mentor: only meaning can tell them apart.
    const mentee = await createUser('learner', ['visual design']);
    const res = await request(app.getHttpServer())
      .get(url)
      .query({ limit: 50 })
      .auth(await sign(mentee.id), { type: 'bearer' })
      .expect(200);
    const items = (res.body as RecommendationBody).data.items;
    const rank = (id: string) => items.findIndex((i) => i.mentor.id === id);
    expect(rank(designerId)).toBeGreaterThanOrEqual(0);
    expect(rank(designerId)).toBeLessThan(rank(cookId));
    expect(items[rank(designerId)].matchedSkills).toEqual([]);
    expect(items[rank(designerId)].rationale).toContain(
      'Profile closely matches your goals',
    );
  });
});
