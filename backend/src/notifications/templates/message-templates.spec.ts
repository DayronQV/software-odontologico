import { NotificationKind } from '@prisma/client';
import { renderMessage, type MessageContext } from './message-templates';
import { maskRecipient } from '../history/notification-history.service';

const ctx: MessageContext = {
  clinicName: 'Clínica SIGO',
  patientFirstName: 'Carlos',
  startAt: new Date('2026-11-02T15:30:00Z'), // 10:30 en Bogotá
  timezone: 'America/Bogota',
  professionalName: 'Dr. Andrés Salazar',
  officeName: 'Consultorio Principal',
};

describe('plantillas de mensajes (RF-11)', () => {
  it('confirmación: fecha local, profesional, consultorio y pedido de confirmar', () => {
    const { subject, body } = renderMessage(NotificationKind.CONFIRMATION, ctx);
    expect(subject).toContain('Cita agendada');
    expect(body).toContain('Hola Carlos');
    expect(body).toContain('lunes, 2 de noviembre de 2026');
    expect(body).toContain('10:30');
    expect(body).toContain('Dr. Andrés Salazar');
    expect(body).toContain('Consultorio Principal');
    expect(body).toContain('Responda SÍ');
  });

  it('reprogramación', () => {
    const { subject, body } = renderMessage(NotificationKind.RESCHEDULED, ctx);
    expect(subject).toContain('reprogramada');
    expect(body).toContain('fue reprogramada');
  });

  it.each([
    [24, 'mañana'],
    [48, 'pasado mañana'],
    [6, 'en 6 horas'],
  ])('recordatorio %i h: "%s"', (leadHours, phrase) => {
    const { subject, body } = renderMessage(NotificationKind.REMINDER, { ...ctx, leadHours });
    expect(subject).toContain('Recordatorio');
    expect(body).toContain(phrase);
  });
});

describe('maskRecipient', () => {
  it('oculta teléfonos y correos en el historial', () => {
    expect(maskRecipient('+593 99 123 4567')).toBe('***4567');
    expect(maskRecipient('carlos@correo.test')).toBe('c***@correo.test');
    expect(maskRecipient(null)).toBeNull();
  });
});
