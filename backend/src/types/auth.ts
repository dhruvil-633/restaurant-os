import type { UserRole } from './roles';

/** The authenticated principal attached to every protected request. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
