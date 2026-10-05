import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Interceptor that serializes controller responses using a given DTO class.
 *
 * It runs `plainToInstance` with `excludeExtraneousValues: true`, so only
 * properties decorated with `@Expose()` in the DTO will appear in the response.
 *
 * Usage — apply via the `@Serialize()` decorator on a controller or handler:
 *
 * ```ts
 * @Serialize(UserResponseDto)
 * @Get(':id')
 * findOne(@Param('id') id: string) { ... }
 * ```
 */
@Injectable()
export class SerializeInterceptor<T extends object> implements NestInterceptor {
  constructor(private dto: new () => T) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<T | T[]> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (Array.isArray(data)) {
          return data.map((item) => this.transform(item));
        }
        return this.transform(data);
      }),
    );
  }

  private transform(data: unknown): T {
    return plainToInstance(this.dto, data, {
      excludeExtraneousValues: true,
    });
  }
}
