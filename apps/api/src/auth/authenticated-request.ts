import type { AuthUser } from './auth-user';

export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    [header: string]: string | string[] | undefined;
  };
  user: AuthUser;
}
