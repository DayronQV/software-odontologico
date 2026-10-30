import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto/settings.dto';

const SETTINGS_ID = 1;

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('es', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/** Parámetros globales de la clínica (fila única). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  get() {
    return this.prisma.db.clinicSettings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
  }

  async update(dto: UpdateSettingsDto) {
    const current = await this.get();
    const opens = dto.opensAtMinute ?? current.opensAtMinute;
    const closes = dto.closesAtMinute ?? current.closesAtMinute;
    if (closes <= opens) {
      throw new BadRequestException('La hora de cierre debe ser posterior a la de apertura');
    }
    if (dto.timezone && !isValidTimezone(dto.timezone)) {
      throw new BadRequestException('Zona horaria inválida (use un identificador IANA)');
    }
    return this.prisma.db.clinicSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        clinicName: dto.clinicName?.trim(),
        timezone: dto.timezone,
        currency: dto.currency,
        taxRatePercent: dto.taxRatePercent,
        opensAtMinute: dto.opensAtMinute,
        closesAtMinute: dto.closesAtMinute,
        reminderHours: dto.reminderHours && [...dto.reminderHours].sort((a, b) => b - a),
        maxDiscountPercent: dto.maxDiscountPercent,
        noteLockHours: dto.noteLockHours,
      },
    });
  }
}
