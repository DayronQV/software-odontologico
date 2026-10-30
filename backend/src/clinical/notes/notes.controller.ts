import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { CLINICAL_STAFF, DENTISTS } from '../../common/role-groups';
import { AUTH_THROTTLE } from '../../common/throttle';
import type { AuthUser } from '../../common/types';
import { Throttle } from '@nestjs/throttler';
import { AddendaService } from './addenda.service';
import { CreateAddendumDto, CreateNoteDto, CreateVitalSignsDto, SignDto, UpdateNoteDto } from './dto/notes.dto';
import { NotesService } from './notes.service';
import { VitalSignsService } from './vital-signs.service';

/** Evolución clínica: notas SOEP, notas del asistente, firma y adendas (RF-05, RN-01). */
@ApiTags('clinical')
@ApiBearerAuth()
@AuditEntity('EvolutionNote')
@Controller()
export class NotesController {
  constructor(
    private readonly notes: NotesService,
    private readonly addenda: AddendaService,
  ) {}

  @Roles(...CLINICAL_STAFF)
  @Get('patients/:patientId/notes')
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.notes.list(patientId);
  }

  /** El odontólogo crea notas SOEP; el asistente, notas clínicas propias (no sustituyen a la del odontólogo). */
  @Roles(...CLINICAL_STAFF)
  @Post('patients/:patientId/notes')
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notes.create(patientId, dto, user);
  }

  @Roles(...CLINICAL_STAFF)
  @Patch('notes/:noteId')
  update(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notes.update(noteId, dto, user);
  }

  @Roles(...DENTISTS)
  @Throttle({ default: AUTH_THROTTLE })
  @HttpCode(200)
  @AuditAction('SIGN')
  @Post('notes/:noteId/sign')
  sign(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: SignDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.notes.sign(noteId, dto.password, user);
  }

  @Roles(...CLINICAL_STAFF)
  @Get('patients/:patientId/notes/:noteId/verify')
  verify(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ) {
    return this.notes.verify(patientId, noteId);
  }

  /** Adenda firmada: única vía de corregir una nota bloqueada. */
  @Roles(...CLINICAL_STAFF)
  @Throttle({ default: AUTH_THROTTLE })
  @AuditAction('ADDENDUM')
  @Post('notes/:noteId/addenda')
  addToNote(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: CreateAddendumDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.addenda.addToNote(noteId, dto, user);
  }
}

/** Signos vitales (los registra el asistente antes de la atención). */
@ApiTags('clinical')
@ApiBearerAuth()
@Roles(...CLINICAL_STAFF)
@AuditEntity('VitalSigns')
@Controller('patients/:patientId/vital-signs')
export class VitalSignsController {
  constructor(private readonly vitals: VitalSignsService) {}

  @Get()
  list(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.vitals.list(patientId);
  }

  @Post()
  create(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body() dto: CreateVitalSignsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.vitals.create(patientId, dto, user);
  }
}
