import { BadRequestException, Injectable } from '@nestjs/common';
import { AlertKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateAlertRuleDto, UpdateAlertRuleDto } from './dto/alert-rule.dto';

/** Estos tipos no necesitan palabra clave: se activan por sí solos (anticoagulado, coagulopatía registrada). */
const KINDS_WITHOUT_KEYWORD: AlertKind[] = [AlertKind.ANTICOAGULANT, AlertKind.COAGULOPATHY];

/** Reglas configurables que convierten la anamnesis en alertas médicas (RF-02). */
@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(onlyActive = false) {
    return this.prisma.db.alertRule.findMany({
      where: onlyActive ? { active: true } : undefined,
      orderBy: [{ severity: 'asc' }, { label: 'asc' }],
    });
  }

  create(dto: CreateAlertRuleDto) {
    if (!KINDS_WITHOUT_KEYWORD.includes(dto.kind) && !dto.keyword?.trim()) {
      throw new BadRequestException('Este tipo de regla requiere una palabra clave');
    }
    return this.prisma.db.alertRule.create({
      data: {
        label: dto.label.trim(),
        kind: dto.kind,
        keyword: dto.keyword?.trim(),
        severity: dto.severity,
      },
    });
  }

  update(id: string, dto: UpdateAlertRuleDto) {
    return this.prisma.db.alertRule.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        keyword: dto.keyword?.trim(),
        severity: dto.severity,
        active: dto.active,
      },
    });
  }
}
