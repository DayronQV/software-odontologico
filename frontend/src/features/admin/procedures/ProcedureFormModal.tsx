import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../../../components/ui/Button';
import { CheckboxField, Field } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/useResource';
import type { Procedure } from '../../catalog/types';

const schema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/, 'Letras, números y guiones (2 a 20)'),
  name: z.string().trim().min(3, 'Mínimo 3 caracteres').max(120),
  category: z.string().trim().min(2, 'Indique la categoría').max(60),
  durationMinutes: z.number({ message: 'Ingrese la duración' }).int().min(5, 'Mínimo 5 min').max(480, 'Máximo 480 min'),
  basePrice: z.number({ message: 'Ingrese el precio' }).min(0, 'No puede ser negativo').max(10_000_000),
  labCost: z.number({ message: 'Ingrese un valor' }).min(0, 'No puede ser negativo').max(10_000_000),
  requiresConsent: z.boolean(),
});
type Form = z.infer<typeof schema>;

interface Props {
  state: { procedure: Procedure | null } | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ProcedureFormModal({ state, onClose, onSaved }: Props) {
  const toast = useToast();
  const procedure = state?.procedure ?? null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (state) {
      reset({
        code: procedure?.code ?? '',
        name: procedure?.name ?? '',
        category: procedure?.category ?? '',
        durationMinutes: procedure?.durationMinutes ?? 30,
        basePrice: procedure?.basePrice ?? 0,
        labCost: procedure?.labCost ?? 0,
        requiresConsent: procedure?.requiresConsent ?? false,
      });
    }
  }, [state, procedure, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (procedure) await api(`/catalog/procedures/${procedure.id}`, { method: 'PATCH', body: values });
      else await api('/catalog/procedures', { method: 'POST', body: values });
      toast.push('success', procedure ? 'Procedimiento actualizado' : 'Procedimiento creado');
      onSaved();
      onClose();
    } catch (e) {
      toast.push('error', errorMessage(e));
    }
  });

  return (
    <Modal open={!!state} title={procedure ? 'Editar procedimiento' : 'Nuevo procedimiento'} onClose={onClose} size="lg">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Código" placeholder="LIMP-01" error={errors.code?.message} {...register('code')} />
          <div className="sm:col-span-2">
            <Field label="Nombre" error={errors.name?.message} {...register('name')} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoría" placeholder="Preventiva, endodoncia…" error={errors.category?.message} {...register('category')} />
          <Field label="Duración estándar (min)" type="number" inputMode="numeric" error={errors.durationMinutes?.message} {...register('durationMinutes', { valueAsNumber: true })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio base" type="number" step="0.01" inputMode="decimal" error={errors.basePrice?.message} {...register('basePrice', { valueAsNumber: true })} />
          <Field label="Costo de laboratorio estimado" type="number" step="0.01" inputMode="decimal" error={errors.labCost?.message} {...register('labCost', { valueAsNumber: true })} />
        </div>
        <CheckboxField label="Requiere consentimiento informado" hint="Se firmará antes del procedimiento (Fase 2)." {...register('requiresConsent')} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={isSubmitting}>Guardar</Button>
        </div>
      </form>
    </Modal>
  );
}
