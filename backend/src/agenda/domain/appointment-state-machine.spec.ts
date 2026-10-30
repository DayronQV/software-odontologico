import { AppointmentStatus as S, Role } from '@prisma/client';
import {
  availableTransitions,
  canRoleSetStatus,
  canTransition,
  CLOSING_STATUSES,
  RELEASED_STATUSES,
  RESCHEDULABLE_STATUSES,
} from './appointment-state-machine';

describe('máquina de estados de la cita (RF-10)', () => {
  it('recorre el flujo feliz: Programado → Confirmado → Sala de espera → En atención → Atendido', () => {
    const flow = [S.SCHEDULED, S.CONFIRMED, S.WAITING_ROOM, S.IN_ATTENTION, S.ATTENDED];
    for (let i = 0; i < flow.length - 1; i++) expect(canTransition(flow[i], flow[i + 1])).toBe(true);
  });

  it('permite llegar a sala de espera sin confirmar previamente', () => {
    expect(canTransition(S.SCHEDULED, S.WAITING_ROOM)).toBe(true);
  });

  it('permite cancelar o marcar inasistencia antes de la atención', () => {
    for (const from of [S.SCHEDULED, S.CONFIRMED, S.WAITING_ROOM]) {
      expect(canTransition(from, S.CANCELED)).toBe(true);
      expect(canTransition(from, S.NO_SHOW)).toBe(true);
    }
  });

  it('una vez en atención solo se puede terminar', () => {
    expect(availableTransitions(S.IN_ATTENTION, Role.ODONTOLOGO)).toEqual([S.ATTENDED]);
    expect(canTransition(S.IN_ATTENTION, S.CANCELED)).toBe(false);
    expect(canTransition(S.IN_ATTENTION, S.NO_SHOW)).toBe(false);
  });

  it('los estados finales no tienen salida', () => {
    for (const final of [S.ATTENDED, S.CANCELED, S.NO_SHOW]) {
      for (const to of Object.values(S)) expect(canTransition(final, to)).toBe(false);
    }
  });

  it('no se puede retroceder ni saltarse la sala de espera para atender', () => {
    expect(canTransition(S.CONFIRMED, S.SCHEDULED)).toBe(false);
    expect(canTransition(S.WAITING_ROOM, S.CONFIRMED)).toBe(false);
    expect(canTransition(S.SCHEDULED, S.IN_ATTENTION)).toBe(false);
    expect(canTransition(S.CONFIRMED, S.ATTENDED)).toBe(false);
  });

  it('recepción gestiona el flujo; el personal clínico, la atención', () => {
    expect(canRoleSetStatus(Role.RECEPCIONISTA, S.CONFIRMED)).toBe(true);
    expect(canRoleSetStatus(Role.RECEPCIONISTA, S.WAITING_ROOM)).toBe(true);
    expect(canRoleSetStatus(Role.RECEPCIONISTA, S.CANCELED)).toBe(true);
    expect(canRoleSetStatus(Role.RECEPCIONISTA, S.IN_ATTENTION)).toBe(false);
    expect(canRoleSetStatus(Role.RECEPCIONISTA, S.ATTENDED)).toBe(false);

    for (const role of [Role.ODONTOLOGO, Role.ASISTENTE]) {
      expect(canRoleSetStatus(role, S.IN_ATTENTION)).toBe(true);
      expect(canRoleSetStatus(role, S.ATTENDED)).toBe(true);
      expect(canRoleSetStatus(role, S.CANCELED)).toBe(false);
    }
    for (const role of [Role.ADMIN_TI, Role.AUDITOR]) {
      for (const to of Object.values(S)) expect(canRoleSetStatus(role, to)).toBe(false);
    }
  });

  it('availableTransitions combina transición válida y permiso del rol', () => {
    expect(availableTransitions(S.WAITING_ROOM, Role.RECEPCIONISTA)).toEqual([S.CANCELED, S.NO_SHOW]);
    expect(availableTransitions(S.WAITING_ROOM, Role.ODONTOLOGO)).toEqual([S.IN_ATTENTION]);
    expect(availableTransitions(S.ATTENDED, Role.RECEPCIONISTA)).toEqual([]);
  });

  it('define qué estados liberan el horario, permiten reprogramar y cierran recordatorios', () => {
    expect(RELEASED_STATUSES).toEqual([S.CANCELED, S.NO_SHOW]);
    expect(RESCHEDULABLE_STATUSES).toEqual([S.SCHEDULED, S.CONFIRMED]);
    expect(CLOSING_STATUSES).toEqual(expect.arrayContaining([S.ATTENDED, S.CANCELED, S.NO_SHOW]));
  });
});
