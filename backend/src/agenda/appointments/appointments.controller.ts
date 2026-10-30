import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppointmentStatus, Role } from '@prisma/client';
import { AuditAction, AuditEntity, CurrentUser, Roles } from '../../common/decorators';
import { PATIENT_STAFF } from '../../common/role-groups';
import type { AuthUser } from '../../common/types';
import { AppointmentStatusService } from './appointment-status.service';
import { AppointmentsQueryService } from './appointments-query.service';
import { AppointmentsService } from './appointments.service';
import {
  AppointmentQueryDto,
  ChangeStatusDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
} from './dto/appointment.dto';

/** Agenda de citas por sillón y profesional (RF-09), estados (RF-10) y sin solapamientos (RN-03). */
@ApiTags('agenda')
@ApiBearerAuth()
@AuditEntity('Appointment')
@Controller('agenda/appointments')
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly status: AppointmentStatusService,
    private readonly query: AppointmentsQueryService,
  ) {}

  @Roles(...PATIENT_STAFF)
  @Get()
  list(@Query() query: AppointmentQueryDto, @CurrentUser() user: AuthUser) {
    return this.query.list(query, user);
  }

  /** Sala de espera de hoy, por orden de llegada. */
  @Roles(...PATIENT_STAFF)
  @Get('waiting-room')
  waitingRoom(@CurrentUser() user: AuthUser) {
    return this.query.waitingRoom(user);
  }

  @Roles(...PATIENT_STAFF)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.query.findOne(id, user);
  }

  @Roles(...PATIENT_STAFF)
  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.query.history(id, user);
  }

  @Roles(Role.RECEPCIONISTA)
  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthUser) {
    return this.appointments.create(dto, user);
  }

  @Roles(Role.RECEPCIONISTA)
  @Patch(':id/reschedule')
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appointments.reschedule(id, dto, user);
  }

  /** Cambia el estado. Recepción: confirmar, sala de espera, cancelar, no asistió. Clínico: atención y atendido. */
  @Roles(...PATIENT_STAFF)
  @AuditAction('STATUS_CHANGED')
  @HttpCode(200)
  @Post(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.status.change(id, dto, user);
  }

  /**
   * Simula la respuesta del paciente a la confirmación (en producción llegaría por el webhook de
   * WhatsApp/SMS): la cita pasa a Confirmado.
   */
  @Roles(Role.RECEPCIONISTA)
  @AuditAction('PATIENT_CONFIRMED')
  @HttpCode(200)
  @Post(':id/patient-confirmation')
  patientConfirmation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.status.change(
      id,
      { to: AppointmentStatus.CONFIRMED },
      user,
      'Confirmada por el paciente (respuesta simulada)',
    );
  }
}
