import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Field } from '../../../components/ui/Field';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { clockToMinutes, minutesToClock } from '../../../lib/format';
import { errorMessage } from '../../../lib/useResource';
import { useSettings } from '../../catalog/SettingsProvider';

const schema = z
  .object({
    clinicName: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120),
    timezone: z.string().trim().min(3, 'Indique la zona horaria').max(60),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Código de 3 letras (USD, COP…)'),
    taxRatePercent: z.number({ message: 'Ingrese un número' }).min(0).max(100),
    maxDiscountPercent: z.number({ message: 'Ingrese un número' }).min(0).max(100),
    noteLockHours: z.number({ message: 'Ingrese un número' }).int('Use horas enteras').min(0).max(720),
    opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
    closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida'),
    reminderHours: z
      .string()
      .regex(/^\s*\d+(\s*,\s*\d+)*\s*$/, 'Horas separadas por coma, p. ej. 48, 24'),
  })
  .refine((v) => clockToMinutes(v.closesAt) > clockToMinutes(v.opensAt), {
    path: ['closesAt'],
    message: 'El cierre debe ser posterior a la apertura',
  });
type Form = z.infer<typeof schema>;

export function SettingsPage() {
  const toast = useToast();
  const { settings, refresh } = useSettings();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    reset({
      clinicName: settings.clinicName,
      timezone: settings.timezone,
      currency: settings.currency,
      taxRatePercent: settings.taxRatePercent,
      maxDiscountPercent: settings.maxDiscountPercent,
      noteLockHours: settings.noteLockHours,
      opensAt: minutesToClock(settings.opensAtMinute),
      closesAt: minutesToClock(settings.closesAtMinute),
      reminderHours: settings.reminderHours.join(', '),
    });
  }, [settings, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await api('/catalog/settings', {
        method: 'PATCH',
        body: {
          clinicName: v.clinicName,
          timezone: v.timezone,
          currency: v.currency,
          taxRatePercent: v.taxRatePercent,
          maxDiscountPercent: v.maxDiscountPercent,
          noteLockHours: v.noteLockHours,
          opensAtMinute: clockToMinutes(v.opensAt),
          closesAtMinute: clockToMinutes(v.closesAt),
          reminderHours: [...new Set(v.reminderHours.split(',').map((h) => Number(h.trim())))],
        },
      });
      await refresh();
      toast.push('success', 'Parámetros guardados');
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <Card title="Clínica" description="Nombre y zona horaria usados en citas, mensajes y comprobantes.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la clínica" error={errors.clinicName?.message} {...register('clinicName')} />
          <Field label="Zona horaria" placeholder="America/Bogota" hint="Identificador IANA." error={errors.timezone?.message} {...register('timezone')} />
          <Field label="Hora de apertura" type="time" error={errors.opensAt?.message} {...register('opensAt')} />
          <Field label="Hora de cierre" type="time" error={errors.closesAt?.message} {...register('closesAt')} />
        </div>
      </Card>

      <Card title="Facturación" description="Moneda, impuesto y tope de descuentos sin autorización.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Moneda" placeholder="USD" error={errors.currency?.message} {...register('currency')} />
          <Field label="Impuesto (%)" type="number" step="0.01" error={errors.taxRatePercent?.message} {...register('taxRatePercent', { valueAsNumber: true })} />
          <Field label="Descuento máximo de recepción (%)" type="number" step="0.01" hint="Más de esto lo autoriza el administrador." error={errors.maxDiscountPercent?.message} {...register('maxDiscountPercent', { valueAsNumber: true })} />
        </div>
      </Card>

      <Card title="Recordatorios" description="Cuántas horas antes de la cita se avisa al paciente.">
        <div className="max-w-sm">
          <Field label="Horas de antelación" placeholder="48, 24" error={errors.reminderHours?.message} {...register('reminderHours')} />
        </div>
      </Card>

      <Card title="Historia clínica" description="Las notas de evolución se pueden editar durante este plazo; después solo se corrigen con una adenda firmada.">
        <div className="max-w-sm">
          <Field label="Plazo de edición de notas (horas)" type="number" hint="24 por defecto." error={errors.noteLockHours?.message} {...register('noteLockHours', { valueAsNumber: true })} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>Guardar parámetros</Button>
      </div>
    </form>
  );
}
