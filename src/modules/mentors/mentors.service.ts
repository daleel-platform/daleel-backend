import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { PaginationMetaDto } from '../../common/pagination/pagination-meta.dto.js';
import {
  CreateMentorDto,
  type MentorExperienceInputDto,
} from './dto/create-mentor.dto.js';
import { UpdateMentorDto } from './dto/update-mentor.dto.js';
import { MentorQueryDto } from './dto/mentor-query.dto.js';
import {
  MENTOR_EXPERIENCE_ORDER_BY,
  MentorEmbeddingService,
} from './mentor-embedding.service.js';
import {
  MentorResponseDto,
  PaginatedMentorResponseDto,
} from './dto/mentor-response.dto.js';

export const PUBLIC_USER = {
  user: { select: { id: true, name: true, avatarUrl: true, bio: true } },
} as const;

export const MENTOR_PUBLIC_INCLUDE = {
  ...PUBLIC_USER,
  experiences: {
    orderBy: MENTOR_EXPERIENCE_ORDER_BY,
  },
} satisfies Prisma.MentorProfileInclude;

/** Vectors are internal to matching; never load them for public responses. */
const NO_EMBEDDING = { embedding: true, embeddingModel: true } as const;

@Injectable()
export class MentorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly embeddings: MentorEmbeddingService,
  ) {}

  async create(
    userId: string,
    dto: CreateMentorDto,
  ): Promise<MentorResponseDto> {
    await this.users.findById(userId);
    try {
      const data = {
        userId,
        headline: dto.headline,
        about: dto.about,
        skills: dto.skills,
        yearsOfExperience: dto.yearsOfExperience,
        linkedinUrl: dto.linkedinUrl,
        ...(dto.experiences && dto.experiences.length > 0
          ? {
              experiences: {
                create: this.toExperienceCreateData(dto.experiences),
              },
            }
          : {}),
      };
      const profile = await this.prisma.mentorProfile.create({
        data,
        include: MENTOR_PUBLIC_INCLUDE,
        omit: NO_EMBEDDING,
      });
      await this.embeddings.refresh(profile.id, profile);
      return profile;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You already have a mentor profile');
      }
      throw error;
    }
  }

  async update(
    userId: string,
    dto: UpdateMentorDto,
  ): Promise<MentorResponseDto> {
    // Mark the vector stale in the same write; refresh() replaces it.
    const profile = await this.updateOwn(userId, {
      headline: dto.headline,
      about: dto.about,
      skills: dto.skills,
      yearsOfExperience: dto.yearsOfExperience,
      linkedinUrl: dto.linkedinUrl,
      ...(dto.experiences !== undefined
        ? {
            experiences: {
              deleteMany: {},
              create: this.toExperienceCreateData(dto.experiences),
            },
          }
        : {}),
      embeddingModel: null,
    });
    await this.embeddings.refresh(profile.id, profile);
    return profile;
  }

  async setStatus(
    userId: string,
    isActive: boolean,
  ): Promise<MentorResponseDto> {
    return this.updateOwn(userId, { isActive });
  }

  private toExperienceCreateData(
    experiences: readonly MentorExperienceInputDto[],
  ): Prisma.MentorExperienceCreateWithoutMentorProfileInput[] {
    return experiences.map((exp) => ({
      title: exp.title,
      company: exp.company,
      startYear: exp.startYear,
      endYear: exp.endYear ?? null,
      summary: exp.summary,
    }));
  }

  private async updateOwn(
    userId: string,
    data: Prisma.MentorProfileUpdateInput,
  ): Promise<MentorResponseDto> {
    try {
      return await this.prisma.mentorProfile.update({
        where: { userId },
        data,
        include: MENTOR_PUBLIC_INCLUDE,
        omit: NO_EMBEDDING,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Mentor profile not found');
      }
      throw error;
    }
  }

  async findOne(id: string): Promise<MentorResponseDto> {
    const mentor = await this.prisma.mentorProfile.findUnique({
      where: { id, isActive: true },
      include: MENTOR_PUBLIC_INCLUDE,
      omit: NO_EMBEDDING,
    });
    if (!mentor) throw new NotFoundException('Mentor profile not found');
    return mentor;
  }

  async findAll(query: MentorQueryDto): Promise<PaginatedMentorResponseDto> {
    const skip = (query.page - 1) * query.limit;
    if (!Number.isSafeInteger(skip))
      throw new BadRequestException('Page offset is too large');
    const where: Prisma.MentorProfileWhereInput = {
      isActive: true,
      ...(query.skills?.length ? { skills: { hasSome: query.skills } } : {}),
      ...(query.minExperience !== undefined
        ? { yearsOfExperience: { gte: query.minExperience } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { headline: { contains: query.search, mode: 'insensitive' } },
              {
                user: { name: { contains: query.search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const [items, totalItems] = await this.prisma.$transaction(
      [
        this.prisma.mentorProfile.findMany({
          where,
          include: PUBLIC_USER,
          omit: NO_EMBEDDING,
          skip,
          take: query.limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        }),
        this.prisma.mentorProfile.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items,
      meta: PaginationMetaDto.create(totalItems, items.length, query),
    };
  }
}
