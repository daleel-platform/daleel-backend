# Password reset — local development

Issue #4 is implemented under the existing /api/v1 prefix.

## Setup

Run these from this project folder after stopping the development server:

```cmd
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm start:dev
```

The migration only adds two nullable columns and a unique index to users.
Existing accounts are preserved. Do not reset your database.

## Test in Swagger

1. Open http://localhost:3000/api/docs.
2. Register a test user using POST /api/v1/auth/register (or use an existing account).
3. Call POST /api/v1/auth/forgot-password with { "email": "your-test-email@example.com" }.
4. Read the server terminal for "Local password reset" and copy the token after token=.
5. Call POST /api/v1/auth/reset-password with:

```json
{ "token": "paste-the-64-character-token-here", "password": "NewSecurePass1!" }
```

6. Log in with the new password. The old password must fail.
7. Submit the same token again: it must return 400.

Requesting a reset for an unknown email returns the same 200 message, without sending a link.
Tokens expire after 20 minutes by default. Set PASSWORD_RESET_EXPIRES_IN in .env
to change the lifetime in seconds (1200 = 20 minutes), then restart the server. Requesting another link replaces the previous one.
Passwords use the registration rules (8–72 bytes, upper/lowercase, number and special character)
and the existing BCRYPT_SALT_ROUNDS setting.

## Delivery scope

This implements the issue's permitted local console delivery, not real email delivery.
Reset links are printed to the console in every environment; no email is sent.
No token is returned by the API.
PASSWORD_RESET_URL optionally sets the frontend reset page, defaulting to
http://localhost:3000/reset-password. A frontend page is not included in this backend issue;
use the logged token in Swagger for local testing.

Existing JWT sessions are not revoked by this feature; session revocation is outside this issue.

## Verification

```cmd
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

End-to-end tests require a separate test database configured in .env.test. Never point them
at a production database. They cover actual PostgreSQL updates, concurrent token reuse,
expiration, replacement, input validation and logging in after reset.
