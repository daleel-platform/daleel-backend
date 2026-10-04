import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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
  });

  if (errors.length > 0) {
    throw new Error(`Environment validation error: ${errors.toString()}`);
  }
  return validatedConfig;
}
