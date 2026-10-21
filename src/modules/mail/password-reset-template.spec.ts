import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Handlebars from 'handlebars';
import type { PasswordResetEmailContext } from './mail.types.js';

describe('Password reset email template', () => {
  const templateSource = readFileSync(
    join(process.cwd(), 'src/modules/mail/templates/password-reset.hbs'),
    'utf8',
  );

  const template = Handlebars.compile<PasswordResetEmailContext>(
    templateSource,
    { strict: true },
  );

  it('renders the user name, reset link, and expiry time', () => {
    const html = template({
      name: 'Jana',
      resetUrl: 'http://localhost:3000/reset-password?token=abc123',
      expiryMinutes: 20,
    });

    expect(html).toContain('Hello Jana');
    expect(html).toContain(
      'href="http://localhost:3000/reset-password?token&#x3D;abc123"',
    );
    expect(html).toContain('20 minutes');
    expect(html).toContain('Reset Password');
  });

  it('escapes unsafe HTML in the user name', () => {
    const html = template({
      name: '<script>alert("test")</script>',
      resetUrl: 'http://localhost:3000/reset-password?token=abc123',
      expiryMinutes: 20,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
