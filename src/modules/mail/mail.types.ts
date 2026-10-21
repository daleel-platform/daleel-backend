export interface PasswordResetEmailContext {
  name: string;
  resetUrl: string;
  expiryMinutes: number;
}
