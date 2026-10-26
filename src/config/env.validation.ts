import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  ValidateIf,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @ValidateIf((env: EnvironmentVariables) =>
    [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ].some((value) => value !== undefined),
  )
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_CLOUD_NAME: string;

  @ValidateIf((env: EnvironmentVariables) =>
    [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ].some((value) => value !== undefined),
  )
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_KEY: string;

  @ValidateIf((env: EnvironmentVariables) =>
    [
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
    ].some((value) => value !== undefined),
  )
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_SECRET: string;

  @IsInt()
  @Min(1)
  @Max(52428800)
  STORAGE_IMAGE_MAX_BYTES: number = 5242880;

  @IsInt()
  @Min(1)
  @Max(52428800)
  STORAGE_DOCUMENT_MAX_BYTES: number = 15728640;

  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsInt()
  @Min(1)
  JWT_ACCESS_EXPIRES_IN: number = 900;

  @IsInt()
  @Min(1)
  JWT_REFRESH_EXPIRES_IN: number = 604800;

  @IsNotEmpty()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  PASSWORD_RESET_URL: string;

  @IsInt()
  @Min(1)
  PASSWORD_RESET_EXPIRES_IN: number = 1200;

  // SMTP Configuration

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_HOST?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  SMTP_FROM?: string;

  @IsInt()
  @Min(4)
  @Max(31)
  BCRYPT_SALT_ROUNDS: number = 12;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation error: ${errors.toString()}`);
  }

  const smtpValues = [
    validatedConfig.SMTP_HOST,
    validatedConfig.SMTP_PORT,
    validatedConfig.SMTP_USER,
    validatedConfig.SMTP_PASSWORD,
    validatedConfig.SMTP_FROM,
  ];

  const smtpConfigured = smtpValues.every(
    (value) => value !== undefined && value !== null && value !== '',
  );

  const smtpPartiallyConfigured = smtpValues.some(
    (value) => value !== undefined && value !== null && value !== '',
  );

  if (smtpPartiallyConfigured && !smtpConfigured) {
    throw new Error('Incomplete SMTP configuration');
  }

  if (validatedConfig.NODE_ENV === Environment.Production && !smtpConfigured) {
    throw new Error('SMTP configuration is required in production');
  }

  return validatedConfig;
}
