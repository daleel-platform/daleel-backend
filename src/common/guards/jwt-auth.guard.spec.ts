import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  let module: TestingModule;
  let guard: JwtAuthGuard;
  let jwtService: { verifyAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    jwtService = { verifyAsync: vi.fn() };
    module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => 'access-secret' },
        },
      ],
    }).compile();
    guard = module.get(JwtAuthGuard);
  });

  afterEach(async () => {
    await module.close();
  });

  it('verifies a bearer access token and attaches its subject to the request', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-id' });
    const request: Pick<Request, 'headers'> & { user?: { id: string } } = {
      headers: { authorization: 'Bearer access-token' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('access-token', {
      secret: 'access-secret',
    });
    expect(request.user).toEqual({ id: 'user-id' });
  });

  it('rejects requests without a bearer token', async () => {
    const request: Pick<Request, 'headers'> & { user?: { id: string } } = {
      headers: {},
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });
});
