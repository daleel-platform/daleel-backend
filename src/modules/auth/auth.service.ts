import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import {
  UsersService,
  type UserWithMentorProfile,
} from '../users/users.service.js';
import type { AuthSession, TokenPayload } from './auth.types.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    const saltRounds =
      this.configService.getOrThrow<number>('BCRYPT_SALT_ROUNDS');
    const userDto: CreateUserDto = {
      email: dto.email,
      name: dto.name,
      passwordHash: await hash(dto.password, saltRounds),
    };
    const user = await this.usersService.createUser(userDto);

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(dto.email);
    const saltRounds =
      this.configService.getOrThrow<number>('BCRYPT_SALT_ROUNDS');
    if (!user) {
      await hash(dto.password, saltRounds);
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
      typeof payload.sub !== 'string'
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let user: UserWithMentorProfile;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      throw error;
    }
    return this.issueTokens(user);
  }

  private async issueTokens(user: UserWithMentorProfile): Promise<AuthSession> {
    const accessSecret = this.configService.getOrThrow<string>('JWT_SECRET');
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    const accessTtl = this.configService.getOrThrow<number>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    const refreshTtl = this.configService.getOrThrow<number>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: user.id } satisfies TokenPayload,
        {
          secret: accessSecret,
          expiresIn: accessTtl,
        } satisfies JwtSignOptions,
      ),
      this.jwtService.signAsync(
        { sub: user.id } satisfies TokenPayload,
        {
          secret: refreshSecret,
          expiresIn: refreshTtl,
        } satisfies JwtSignOptions,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl,
      user,
    };
  }
}
