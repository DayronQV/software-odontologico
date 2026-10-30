import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** Consultas comunes a todos los módulos clínicos. */
@Injectable()
export class ClinicalLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Falla con 404 si el paciente no existe; devuelve lo básico para los documentos. */
  async assertPatient(patientId: string) {
    const patient = await this.prisma.db.patient.findUnique({
      where: { id: patientId },
      select: { id: true, firstName: true, lastName: true, birthDate: true, sex: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    return patient;
  }

  /** Nombres de usuarios por id, en una sola consulta (para mostrar quién hizo cada registro). */
  async userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.db.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }
}
