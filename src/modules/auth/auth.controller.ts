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
import type { AuthSession } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
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
  ): Promise<AuthResponseDto> {
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
  ): Promise<AuthResponseDto> {
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
  ): Promise<AuthResponseDto> {
    const refreshToken = request.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.withRefreshCookie(
      response,
      await this.authService.refresh(refreshToken),
    );
  }

  private withRefreshCookie(
    response: Response,
    session: AuthSession,
  ): AuthResponseDto {
    const refreshTtl = this.configService.getOrThrow<number>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtl * 1000,
    });
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }
}
