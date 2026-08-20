export interface AuthUser {
  subject: string;
  preferredUsername?: string;
  realmRoles: string[];
  clientRoles: string[];
}
