# Conventions

Coding conventions for the Daleel backend. Read this before writing or reviewing code.

## Project Structure

```
src/
├── main.ts                        # Bootstrap & global setup
├── app.module.ts                  # Root module
├── common/                        # Shared code (guards, pipes, decorators, filters, utils)
├── config/                        # Configuration & environment validation
├── modules/                       # Feature modules
│   └── <feature>/
│       ├── <feature>.module.ts
│       ├── <feature>.controller.ts
│       ├── <feature>.service.ts
│       ├── <feature>.service.spec.ts
│       └── dto/
│           ├── create-<feature>.dto.ts
│           ├── update-<feature>.dto.ts
│           └── <feature>-response.dto.ts
└── prisma/                        # Prisma service & module (no index.ts)
    ├── prisma.module.ts
    └── prisma.service.ts
```

Every feature lives in its own module under `src/modules/`. Do not add feature code directly under `src/`.

## Naming

| Element          | Convention                    | Example                     |
| ---------------- | ----------------------------- | --------------------------- |
| Files            | kebab-case                    | `mentor-profile.service.ts` |
| Classes          | PascalCase                    | `MentorProfileService`      |
| Interfaces       | PascalCase, no `I` prefix     | `MentorProfile`             |
| DTOs             | PascalCase, suffixed with Dto | `CreateMentorDto`           |
| Enums            | PascalCase                    | `SessionStatus`             |
| Variables        | camelCase                     | `mentorProfile`             |
| Constants        | UPPER_SNAKE_CASE              | `MAX_SESSION_DURATION`      |
| Database tables  | snake_case (Prisma `@@map`)   | `mentor_profiles`           |
| Database columns | snake_case (Prisma `@map`)    | `first_name`                |

## TypeScript

- **Strict mode** is enabled — do not use `any`. Use `unknown` and narrow the type.
- Prefer `interface` for object shapes, `type` for unions and intersections.
- Use `readonly` where mutation is not needed.
- Always define return types on public service and controller methods.

## NestJS Patterns

- **One module per feature** — controller, service, and DTOs together.
- **Controllers** handle HTTP concerns only (parsing, validation, status codes). No business logic.
- **Services** contain all business logic. They are the only layer that talks to Prisma.
- **DTOs** use `class-validator` decorators for input validation and `@nestjs/swagger` decorators for API docs.
- **Dependency injection** — always inject via constructor. Never instantiate services manually.
- **Errors** — throw NestJS built-in exceptions (`NotFoundException`, `ConflictException`, `ForbiddenException`, etc.) with a descriptive message. The global `AllExceptionsFilter` handles serialization.

### Module Design

Keep modules focused. If a service has more than ~5–6 public methods or mixes unrelated concerns, split it into separate modules. For example, `mentors` and `mentor-availability` are better as two modules than one bloated `mentors` module with everything.

**Never use `forwardRef()`** — it's a code smell that means the dependency graph is wrong. If two modules need each other, extract the shared concern into a third module that both import, or communicate through events.

**No barrel files (`index.ts`) in modules.** Import directly from specific files (e.g., `../prisma/prisma.service.js`). Barrel files in feature modules cause circular dependencies and undefined DI tokens in ESM (`NodeNext`). Only leaf utility folders (`src/common`, `src/config`) may use `index.ts`.

Dependency flow should always be one-directional: `A → B`, never `A ↔ B`.

### Response Serialization

Every endpoint must serialize its response through a **response DTO**. Use the `@Serialize()` decorator from `src/common`.

1. Create a response DTO class in `dto/<feature>-response.dto.ts`.
2. Mark each exposed field with `@Expose()` from `class-transformer`.
3. Apply `@Serialize(MyResponseDto)` on the controller method or class.

```ts
// dto/mentor-response.dto.ts
import { Expose } from 'class-transformer';

export class MentorResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  // Fields NOT decorated with @Expose() are stripped from the response.
}
```

```ts
// mentors.controller.ts
import { Serialize } from '../../common/index.js';
import { MentorResponseDto } from './dto/mentor-response.dto.js';

@Controller('mentors')
export class MentorsController {
  @Serialize(MentorResponseDto)
  @Get(':id')
  findOne(@Param('id') id: string) { ... }
}
```

This prevents accidental data leaks (passwords, internal fields) and decouples the API shape from the database model. If a field is missing from a response, check that `@Expose()` is present on the DTO property.

## Prisma

- Always run queries through the `PrismaService`.
- Use **transactions** for operations that modify multiple tables.
- Keep Prisma schema as the single source of truth for the database.
- Map model names to snake_case table/column names using `@@map` / `@map`.
- Always generate and commit database migrations for schema changes using `pnpm prisma:migrate:dev --name <descriptive_name>`. Never push unmigrated schema changes.

## Testing

### Unit Tests (Services)

- Live next to the service file: `<feature>.service.spec.ts`.
- Every public service method must have at least one test.
- Use `vi.mock()` to mock dependencies. Prefer injecting mocks via NestJS testing module.
- Focus on business logic — mock `PrismaService` and other dependencies.

### E2E Tests (Controllers)

- Live in the top-level `test/` directory: `test/<feature>.e2e-spec.ts`.
- Test the full HTTP request/response cycle — status codes, response shape, validation errors.
- Use `supertest` against a real NestJS application instance.
- Cover the happy path and key error cases for each endpoint.

## API Design

- Follow RESTful conventions for endpoints and HTTP methods.
- Use plural nouns for resource endpoints: `/mentors`, `/sessions`.
- Return consistent response shapes.
- Document all endpoints with `@ApiTags()`, `@ApiOperation()`, and `@ApiResponse()` decorators.
