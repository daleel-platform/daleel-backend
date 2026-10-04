import type { UserWithMentorProfile } from '../users/users.service.js';

export interface TokenPayload {
  sub: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserWithMentorProfile;
}
