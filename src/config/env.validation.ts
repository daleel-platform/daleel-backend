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

  @IsOptional()
  @IsUrl({
    require_tld: false,
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  PASSWORD_RESET_URL?: string;

  @IsInt()
  @Min(1)
  PASSWORD_RESET_EXPIRES_IN: number = 1200;

  @IsInt()
  @Min(4)
  @Max(31)
  BCRYPT_SALT_ROUNDS: number = 12;
}

export function validate(config: Record<string, unknown>) {
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
  return validatedConfig;
}
