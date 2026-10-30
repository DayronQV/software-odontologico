import type { Role } from '../../../lib/roles';

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
  createdAt: string;
}
