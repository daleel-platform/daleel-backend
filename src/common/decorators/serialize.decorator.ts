import { UseInterceptors } from '@nestjs/common';
import { SerializeInterceptor } from '../interceptors/serialize.interceptor.js';

/**
 * Decorator that applies the `SerializeInterceptor` with the given response DTO.
 *
 * Only properties decorated with `@Expose()` in the DTO will be included in the response.
 *
 * Can be applied to a controller (all routes) or to individual handlers.
 *
 * @example
 * ```ts
 * @Serialize(MentorResponseDto)
 * @Get(':id')
 * findOne(@Param('id') id: string) { ... }
 * ```
 */
export function Serialize<T extends object>(dto: new () => T) {
  return UseInterceptors(new SerializeInterceptor(dto));
}
