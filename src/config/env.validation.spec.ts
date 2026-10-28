import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from './env.validation.js';

const validConfig = {
  DATABASE_URL: 'postgresql://localhost:5432/daleel',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  PASSWORD_RESET_URL: 'http://localhost:5173/reset-password',
};

describe('environment validation', () => {
  it('allows disabled storage but rejects partial credentials and invalid limits', () => {
    expect(validate(validConfig).CLOUDINARY_CLOUD_NAME).toBeUndefined();
    expect(() =>
      validate({ ...validConfig, CLOUDINARY_CLOUD_NAME: 'demo' }),
    ).toThrow();
    expect(
      validate({
        ...validConfig,
        CLOUDINARY_CLOUD_NAME: 'demo',
        CLOUDINARY_API_KEY: 'test-key',
        CLOUDINARY_API_SECRET: 'test-only-secret',
      }).CLOUDINARY_CLOUD_NAME,
    ).toBe('demo');
    expect(() =>
      validate({ ...validConfig, STORAGE_IMAGE_MAX_BYTES: 0 }),
    ).toThrow();
    try {
      validate({ ...validConfig, CLOUDINARY_API_SECRET: 'test-only-secret' });
    } catch (error) {
      expect(String(error)).not.toContain('test-only-secret');
    }
  });
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
  it('enables embeddings by default except in tests, and parses the switch', () => {
    expect(validate(validConfig).EMBEDDINGS_ENABLED).toBe(true);
    expect(
      validate({ ...validConfig, NODE_ENV: 'test' }).EMBEDDINGS_ENABLED,
    ).toBe(false);
    expect(
      validate({ ...validConfig, NODE_ENV: 'test', EMBEDDINGS_ENABLED: 'true' })
        .EMBEDDINGS_ENABLED,
    ).toBe(true);
    expect(
      validate({ ...validConfig, EMBEDDINGS_ENABLED: 'false' })
        .EMBEDDINGS_ENABLED,
    ).toBe(false);
    expect(validate(validConfig).RECOMMENDATIONS_CACHE_TTL).toBe(3600);

    for (const invalid of [
      { EMBEDDINGS_ENABLED: 'yes' },
      { RECOMMENDATIONS_CACHE_TTL: '0' },
    ]) {
      expect(() => validate({ ...validConfig, ...invalid })).toThrow(
        'Environment validation error',
      );
    }
  });

  it('requires a reset URL and accepts valid frontend URLs', () => {
    const { PASSWORD_RESET_URL: _passwordResetUrl, ...configWithoutResetUrl } =
      validConfig;

    expect(() => validate(configWithoutResetUrl)).toThrow(
      'Environment validation error',
    );
    for (const url of [
      'http://localhost:5173/reset-password',
      'https://example.com/reset-password',
    ]) {
      expect(
        validate({ ...validConfig, PASSWORD_RESET_URL: url })
          .PASSWORD_RESET_URL,
      ).toBe(url);
    }
  });

  it('rejects malformed reset URLs at startup', () => {
    for (const url of [
      '',
      'not-a-url',
      'example.com/reset-password',
      'ftp://example.com/reset-password',
    ]) {
      expect(() =>
        validate({ ...validConfig, PASSWORD_RESET_URL: url }),
      ).toThrow('Environment validation error');
    }
  });
});
