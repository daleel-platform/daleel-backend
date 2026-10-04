import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const validConfig = {
  DATABASE_URL: 'postgresql://localhost:5432/daleel',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('environment validation', () => {
  it('uses default token lifetimes and bcrypt cost', () => {
    const config = validate(validConfig);

    expect(config.JWT_ACCESS_EXPIRES_IN).toBe(900);
    expect(config.JWT_REFRESH_EXPIRES_IN).toBe(604800);
    expect(config.BCRYPT_SALT_ROUNDS).toBe(12);
  });

  it('accepts configured token lifetimes and bcrypt cost', () => {
    const config = validate({
      ...validConfig,
      JWT_ACCESS_EXPIRES_IN: '60',
      JWT_REFRESH_EXPIRES_IN: '120',
      BCRYPT_SALT_ROUNDS: '4',
    });

    expect(config.JWT_ACCESS_EXPIRES_IN).toBe(60);
    expect(config.JWT_REFRESH_EXPIRES_IN).toBe(120);
    expect(config.BCRYPT_SALT_ROUNDS).toBe(4);
  });

  it('rejects invalid token lifetimes and bcrypt cost', () => {
    expect(() =>
      validate({ ...validConfig, JWT_ACCESS_EXPIRES_IN: '15m' }),
    ).toThrow('Environment validation error');
    expect(() =>
      validate({ ...validConfig, JWT_REFRESH_EXPIRES_IN: '0' }),
    ).toThrow('Environment validation error');
    expect(() => validate({ ...validConfig, BCRYPT_SALT_ROUNDS: '3' })).toThrow(
      'Environment validation error',
    );
  });
});
