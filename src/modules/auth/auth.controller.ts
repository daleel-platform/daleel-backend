import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Serialize } from '../../common/index.js';
import { AuthService, type AuthSession } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @Serialize(AuthResponseDto)
  @ApiOperation({ summary: 'Register a new account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid registration data' })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    return this.withRefreshCookie(
      response,
      await this.authService.register(dto),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Serialize(AuthResponseDto)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    return this.withRefreshCookie(response, await this.authService.login(dto));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Serialize(AuthResponseDto)
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiOperation({ summary: 'Refresh the access and refresh tokens' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthSession> {
    const refreshToken = this.getRefreshToken(request);
    return this.withRefreshCookie(
      response,
      await this.authService.refresh(refreshToken),
    );
  }

  private withRefreshCookie(
    response: Response,
    session: AuthSession,
  ): AuthSession {
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
    return session;
  }

  private getRefreshToken(request: Request): string {
    const cookieHeader = request.headers.cookie;
    const token = cookieHeader
      ?.split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`))
      ?.slice(REFRESH_COOKIE_NAME.length + 1);

    if (!token) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return token;
  }
}
