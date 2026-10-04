import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import type { UserWithMentorProfile } from '../users/users.service.js';
import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

interface TokenPayload {
  sub: string;
  type: 'access' | 'refresh';
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserWithMentorProfile;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    const userDto: CreateUserDto = {
      email: dto.email,
      name: dto.name,
      passwordHash: await hash(dto.password, 12),
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      ...(dto.bio !== undefined && { bio: dto.bio }),
      ...(dto.interests !== undefined && { interests: dto.interests }),
    };
    const user = await this.usersService.createUser(userDto);

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await hash(dto.password, 12);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(
          error.name,
        )
      ) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      throw error;
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof payload.sub !== 'string' ||
      payload.type !== 'refresh'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    return this.issueTokens(user);
  }

  private async issueTokens(user: UserWithMentorProfile): Promise<AuthSession> {
    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id, type: 'access' } satisfies TokenPayload,
        {
          secret: accessSecret,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        } satisfies JwtSignOptions,
      ),
      this.jwtService.signAsync(
        { sub: user.id, type: 'refresh' } satisfies TokenPayload,
        {
          secret: refreshSecret,
          expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        } satisfies JwtSignOptions,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user,
    };
  }
}
