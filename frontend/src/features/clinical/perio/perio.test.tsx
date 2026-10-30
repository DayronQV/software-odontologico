import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import {
  clinicalAttachmentLevel,
  draftAttachmentLevel,
  EMPTY_DRAFT,
  measuredSites,
  summarize,
  toothProgress,
  toPayload,
  type PerioDraft,
  type PerioSite,
  type SiteDraft,
  type ToothDraft,
} from './perio-calc';
import { PerioGraph } from './PerioGraph';
import { ToothCapture } from './ToothCapture';

describe('cálculo del NIC (RF-04)', () => {
  it('NIC = profundidad al sondaje + recesión', () => {
    expect(clinicalAttachmentLevel(3, 2)).toBe(5);
    expect(clinicalAttachmentLevel(4, 0)).toBe(4);
    expect(clinicalAttachmentLevel(3, -1)).toBe(2);
    expect(clinicalAttachmentLevel(7, 3)).toBe(10);
  });

  it('el NIC del borrador solo existe si hay profundidad; la recesión vacía vale 0', () => {
    expect(draftAttachmentLevel({ probingDepth: '3', gingivalMargin: '2', bleeding: false })).toBe(5);
    expect(draftAttachmentLevel({ probingDepth: '4', gingivalMargin: '', bleeding: false })).toBe(4);
    expect(draftAttachmentLevel({ probingDepth: '', gingivalMargin: '2', bleeding: false })).toBeNull();
    expect(draftAttachmentLevel(undefined)).toBeNull();
  });

  it('resume sangrado, bolsas ≥ 4 mm y profundidad promedio', () => {
    const summary = summarize([
      { probingDepth: 3, bleeding: false },
      { probingDepth: 4, bleeding: true },
      { probingDepth: 6, bleeding: true },
      { probingDepth: 2, bleeding: false },
    ]);
    expect(summary).toEqual({ sites: 4, bleedingPercent: 50, pocketPercent: 50, meanProbingDepth: 3.8 });
    expect(summarize([])).toEqual({ sites: 0, bleedingPercent: 0, pocketPercent: 0, meanProbingDepth: 0 });
  });

  it('arma el cuerpo para la API solo con los puntos medidos e incluye furca y movilidad', () => {
    const draft: PerioDraft = {
      notes: ' Control ',
      sites: {
        '16:V_MESIAL': { probingDepth: '3', gingivalMargin: '1', bleeding: true },
        '16:V_MIDDLE': { probingDepth: '', gingivalMargin: '2', bleeding: false },
      },
      teeth: { 16: { furcation: 2, mobility: 0 }, 26: { furcation: 0, mobility: 1 }, 36: { furcation: 0, mobility: 0 } },
    };
    expect(measuredSites(draft)).toHaveLength(1);
    const body = toPayload(draft);
    expect(body.notes).toBe('Control');
    expect(body.sites).toEqual([{ toothCode: 16, site: 'V_MESIAL', probingDepth: 3, gingivalMargin: 1, bleeding: true }]);
    expect(body.teeth).toEqual([
      { toothCode: 16, furcation: 2, mobility: 0 },
      { toothCode: 26, furcation: 0, mobility: 1 },
    ]);
  });

  it('un diente está completo con sus 6 puntos medidos', () => {
    const sites: PerioDraft['sites'] = {};
    for (const site of ['V_MESIAL', 'V_MIDDLE', 'V_DISTAL', 'L_MESIAL', 'L_MIDDLE', 'L_DISTAL']) {
      sites[`16:${site}`] = { probingDepth: '3', gingivalMargin: '0', bleeding: false };
    }
    expect(toothProgress({ ...EMPTY_DRAFT, sites }, 16)).toBe('COMPLETE');
    expect(toothProgress({ ...EMPTY_DRAFT, sites: { '16:V_MESIAL': sites['16:V_MESIAL'] } }, 16)).toBe('PARTIAL');
    expect(toothProgress(EMPTY_DRAFT, 16)).toBe('EMPTY');
  });
});

function Harness({ readOnly = false, onNext = () => undefined }: { readOnly?: boolean; onNext?: () => void }) {
  const [draft, setDraft] = useState<PerioDraft>(EMPTY_DRAFT);
  const onSite = (tooth: number, site: PerioSite, patch: Partial<SiteDraft>) =>
    setDraft((d) => ({
      ...d,
      sites: { ...d.sites, [`${tooth}:${site}`]: { ...(d.sites[`${tooth}:${site}`] ?? { probingDepth: '', gingivalMargin: '', bleeding: false }), ...patch } },
    }));
  const onTooth = (tooth: number, patch: Partial<ToothDraft>) =>
    setDraft((d) => ({ ...d, teeth: { ...d.teeth, [tooth]: { ...(d.teeth[tooth] ?? { furcation: 0, mobility: 0 }), ...patch } } }));
  return <ToothCapture toothCode={16} draft={draft} readOnly={readOnly} onSite={onSite} onTooth={onTooth} onNext={onNext} />;
}

describe('<ToothCapture>: captura rápida de 6 puntos', () => {
  it('ofrece los 6 puntos (mesial, medio y distal en vestibular y lingual)', () => {
    render(<Harness />);
    expect(screen.getAllByLabelText(/^Profundidad /)).toHaveLength(6);
    expect(screen.getAllByLabelText(/^Recesión /)).toHaveLength(6);
    expect(screen.getAllByLabelText(/^Sangrado /)).toHaveLength(6);
    expect(screen.getAllByLabelText(/^NIC /)).toHaveLength(6);
  });

  it('calcula el NIC al instante: profundidad + recesión', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Profundidad vestibular mesial'), '3');
    expect(screen.getByLabelText('NIC vestibular mesial')).toHaveTextContent('3');
    await userEvent.type(screen.getByLabelText('Recesión vestibular mesial'), '2');
    expect(screen.getByLabelText('NIC vestibular mesial')).toHaveTextContent('5');
    expect(screen.getByLabelText('NIC vestibular medio')).toHaveTextContent('—');
  });

  it('el cursor avanza solo al escribir una profundidad, de punto en punto', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText('Profundidad vestibular mesial'));
    await userEvent.keyboard('3');
    expect(screen.getByLabelText('Profundidad vestibular medio')).toHaveFocus();
    await userEvent.keyboard('4');
    expect(screen.getByLabelText('Profundidad vestibular distal')).toHaveFocus();
    await userEvent.keyboard('2');
    expect(screen.getByLabelText('Profundidad lingual / palatino mesial')).toHaveFocus();
  });

  it('un «1» espera el siguiente dígito (10–15 mm)', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByLabelText('Profundidad vestibular mesial'));
    await userEvent.keyboard('1');
    expect(screen.getByLabelText('Profundidad vestibular mesial')).toHaveFocus();
    await userEvent.keyboard('2');
    expect(screen.getByLabelText('Profundidad vestibular mesial')).toHaveValue('12');
    expect(screen.getByLabelText('Profundidad vestibular medio')).toHaveFocus();
  });

  it('rechaza valores fuera de rango y caracteres no numéricos', async () => {
    render(<Harness />);
    const depth = screen.getByLabelText('Profundidad vestibular mesial');
    await userEvent.type(depth, 'ab');
    expect(depth).toHaveValue('');
    await userEvent.type(depth, '16');
    expect(depth).not.toHaveValue('16');
  });

  it('registra sangrado, furca y movilidad', async () => {
    render(<Harness />);
    const bleeding = screen.getByLabelText('Sangrado vestibular mesial');
    expect(bleeding).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(bleeding);
    expect(bleeding).toHaveAttribute('aria-pressed', 'true');
    await userEvent.selectOptions(screen.getByLabelText('Furca (grado)'), '2');
    await userEvent.selectOptions(screen.getByLabelText('Movilidad'), '3');
    expect(screen.getByLabelText('Furca (grado)')).toHaveValue('2');
    expect(screen.getByLabelText('Movilidad')).toHaveValue('3');
  });

  it('en modo consulta los campos están bloqueados', () => {
    render(<Harness readOnly />);
    expect(screen.getByLabelText('Profundidad vestibular mesial')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Siguiente diente' })).not.toBeInTheDocument();
  });
});

describe('<PerioGraph>', () => {
  it('pinta en rojo las bolsas de 4 mm o más y marca el sangrado', () => {
    const draft: PerioDraft = {
      notes: '',
      sites: {
        '16:V_MESIAL': { probingDepth: '2', gingivalMargin: '0', bleeding: false },
        '16:V_MIDDLE': { probingDepth: '5', gingivalMargin: '0', bleeding: true },
      },
      teeth: {},
    };
    const { container } = render(<PerioGraph draft={draft} notation="FDI" selectedTooth={16} onSelect={() => undefined} />);
    expect(screen.getByTestId('perio-graph')).toBeInTheDocument();
    expect(container.querySelectorAll('rect[fill="#d94f4f"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('rect[fill="#52a69f"]').length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll('circle[fill="#b91c1c"]').length).toBeGreaterThanOrEqual(1);
  });
});
