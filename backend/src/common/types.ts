import type { Request } from 'express';
import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  sessionId: string;
  mfaVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

/** Datos de la petición que se guardan en auditoría. */
export interface RequestMetaData {
  ip: string | null;
  userAgent: string | null;
}
