import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { MentorsService } from './mentors.service.js';
import { MentorQueryDto } from './dto/mentor-query.dto.js';

const error = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('Database error', {
    code,
    clientVersion: '7',
  });
describe('MentorsService', () => {
  let service: MentorsService;
  const profile = { id: 'mentor-id', headline: 'Mentor' };
  const mentorProfile = {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  };
  const prisma = { mentorProfile, $transaction: vi.fn() };
  const users = { findById: vi.fn() };
  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MentorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: users },
      ],
    }).compile();
    service = module.get(MentorsService);
  });
  it('creates a profile for the authenticated user and converts duplicate races to conflict', async () => {
    const dto = {
      headline: 'Mentor',
      about: 'About',
      skills: [],
      yearsOfExperience: 0,
    };
    mentorProfile.create.mockResolvedValue(profile);
    expect(await service.create('owner', dto)).toEqual(profile);
    expect(users.findById).toHaveBeenCalledWith('owner');
    expect(mentorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ...dto, userId: 'owner' } }),
    );
    mentorProfile.create.mockRejectedValue(error('P2002'));
    await expect(service.create('owner', dto)).rejects.toMatchObject({
      status: 409,
    });
    mentorProfile.create.mockRejectedValue(new Error('Unavailable'));
    await expect(service.create('owner', dto)).rejects.toThrow('Unavailable');
  });
  it('updates and changes status by owner only; missing profiles return 404', async () => {
    mentorProfile.update.mockResolvedValue(profile);
    expect(await service.update('owner', { headline: 'New' })).toEqual(profile);
    expect(mentorProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'owner' },
        data: { headline: 'New' },
      }),
    );
    expect(await service.setStatus('owner', false)).toEqual(profile);
    expect(mentorProfile.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { userId: 'owner' },
        data: { isActive: false },
      }),
    );
    mentorProfile.update.mockRejectedValue(error('P2025'));
    await expect(service.update('missing', {})).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.setStatus('missing', false)).rejects.toMatchObject({
      status: 404,
    });
  });
  it('only retrieves active public profiles', async () => {
    mentorProfile.findUnique.mockResolvedValue(profile);
    expect(await service.findOne('mentor-id')).toEqual(profile);
    expect(mentorProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mentor-id', isActive: true } }),
    );
    mentorProfile.findUnique.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('combines filters and uses the same predicate for count and page within a transaction', async () => {
    prisma.$transaction.mockResolvedValue([[profile], 3]);
    const result = await service.findAll({
      page: 2,
      limit: 2,
      skills: ['NestJS'],
      minExperience: 0,
      search: 'mentor',
    });
    const options = mentorProfile.findMany.mock.calls[0][0];
    expect(options).toMatchObject({
      skip: 2,
      take: 2,
      where: {
        isActive: true,
        skills: { hasSome: ['NestJS'] },
        yearsOfExperience: { gte: 0 },
        OR: [
          { headline: { contains: 'mentor', mode: 'insensitive' } },
          { user: { name: { contains: 'mentor', mode: 'insensitive' } } },
        ],
      },
    });
    expect(mentorProfile.count).toHaveBeenCalledWith({ where: options.where });
    expect(result.meta).toEqual({
      totalItems: 3,
      itemCount: 1,
      itemsPerPage: 2,
      totalPages: 2,
      currentPage: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });
  it('handles empty pages and rejects unsafe offsets', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    expect((await service.findAll(new MentorQueryDto())).meta).toMatchObject({
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
    await expect(
      service.findAll({ page: Number.MAX_SAFE_INTEGER, limit: 50 }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
