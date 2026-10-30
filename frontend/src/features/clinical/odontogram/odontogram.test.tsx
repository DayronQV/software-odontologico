import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FindingPanel } from './FindingPanel';
import { FINDING_ORDER, FINDING_TYPES, type Finding } from './findings';
import { Odontogram } from './Odontogram';
import { OdontogramLegend } from './OdontogramLegend';
import { ToothShape } from './ToothShape';
import { surfaceSlots } from './tooth-geometry';
import { archTeeth, fdiToUniversal, isValidToothCode, teethFor, toothLabel, universalToFdi } from './tooth-notation';

const finding = (overrides: Partial<Finding>): Finding => ({
  id: crypto.randomUUID(),
  toothCode: 16,
  surface: 'OCCLUSAL',
  type: 'CARIES',
  status: 'EXISTING',
  notes: null,
  createdAt: '2026-11-02T10:00:00Z',
  createdBy: 'Dr. Salazar',
  removedAt: null,
  removedBy: null,
  removalReason: null,
  replacesId: null,
  ...overrides,
});

describe('notación FDI ↔ Universal (RF-03)', () => {
  it('32 permanentes y 20 temporales (52 en dentición mixta)', () => {
    expect(teethFor('PERMANENT')).toHaveLength(32);
    expect(teethFor('PRIMARY')).toHaveLength(20);
    expect(teethFor('MIXED')).toHaveLength(52);
  });

  it.each([[18, '1'], [11, '8'], [21, '9'], [38, '17'], [48, '32'], [55, 'A'], [51, 'E'], [61, 'F'], [85, 'T']])('FDI %i = Universal %s', (fdi, universal) => {
    expect(fdiToUniversal(fdi)).toBe(universal);
    expect(universalToFdi(universal)).toBe(fdi);
  });

  it('ida y vuelta exacta para los 52 dientes y rechaza códigos inexistentes', () => {
    for (const code of teethFor('MIXED')) expect(universalToFdi(fdiToUniversal(code))).toBe(code);
    expect(isValidToothCode(19)).toBe(false);
    expect(() => fdiToUniversal(99)).toThrow(RangeError);
    expect(toothLabel(26, 'UNIVERSAL')).toBe('14');
  });

  it('cada arco se dibuja de derecha a izquierda del paciente', () => {
    expect(archTeeth('UPPER', 'PERMANENT').slice(0, 3)).toEqual([18, 17, 16]);
    expect(archTeeth('LOWER', 'PRIMARY')).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75]);
  });
});

describe('superficies de un diente', () => {
  it('el vestibular mira hacia afuera y el mesial hacia la línea media', () => {
    expect(surfaceSlots(16)).toMatchObject({ VESTIBULAR: 'TOP', LINGUAL: 'BOTTOM', MESIAL: 'RIGHT', DISTAL: 'LEFT', OCCLUSAL: 'CENTER' });
    expect(surfaceSlots(26)).toMatchObject({ VESTIBULAR: 'TOP', MESIAL: 'LEFT', DISTAL: 'RIGHT' });
    expect(surfaceSlots(46)).toMatchObject({ VESTIBULAR: 'BOTTOM', LINGUAL: 'TOP', MESIAL: 'RIGHT' });
    expect(surfaceSlots(36)).toMatchObject({ VESTIBULAR: 'BOTTOM', MESIAL: 'LEFT' });
  });
});

describe('<Odontogram>: 32 permanentes y 20 temporales', () => {
  const renderChart = (dentition: 'PERMANENT' | 'PRIMARY' | 'MIXED', notation: 'FDI' | 'UNIVERSAL' = 'FDI', onSelect = vi.fn()) =>
    render(<Odontogram findings={[]} dentition={dentition} notation={notation} selectedTooth={null} onSelectTooth={onSelect} />);
  const teeth = () => screen.getAllByRole('button', { name: /^Diente / });

  it('dibuja las 32 piezas permanentes', () => {
    renderChart('PERMANENT');
    expect(teeth()).toHaveLength(32);
    expect(screen.queryByText('Dentición temporal')).not.toBeInTheDocument();
  });

  it('dibuja las 20 piezas temporales', () => {
    renderChart('PRIMARY');
    expect(teeth()).toHaveLength(20);
  });

  it('la dentición mixta muestra ambas (52)', () => {
    renderChart('MIXED');
    expect(teeth()).toHaveLength(52);
  });

  it('cambia la notación: FDI ↔ Universal', () => {
    const { rerender } = renderChart('MIXED', 'FDI');
    expect(screen.getByRole('button', { name: 'Diente 18, sin hallazgos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diente 55, sin hallazgos' })).toBeInTheDocument();
    rerender(<Odontogram findings={[]} dentition="MIXED" notation="UNIVERSAL" selectedTooth={null} onSelectTooth={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Diente 1, sin hallazgos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diente A, sin hallazgos' })).toBeInTheDocument();
    // en Universal el 55 pasa a llamarse «A»: ya no aparece con su código FDI
    expect(screen.queryByRole('button', { name: 'Diente 55, sin hallazgos' })).not.toBeInTheDocument();
  });

  it('un toque en un diente lo selecciona (sin necesidad de hover)', async () => {
    const onSelect = vi.fn();
    renderChart('PERMANENT', 'FDI', onSelect);
    await userEvent.click(screen.getByRole('button', { name: /^Diente 46/ }));
    expect(onSelect).toHaveBeenCalledWith(46);
  });

  it('cuenta los hallazgos de cada diente en su etiqueta accesible', () => {
    render(
      <Odontogram
        findings={[finding({ toothCode: 46 }), finding({ toothCode: 46, surface: 'MESIAL', type: 'RESTORATION' }), finding({ toothCode: 16 })]}
        dentition="PERMANENT"
        notation="FDI"
        selectedTooth={46}
        onSelectTooth={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Diente 46, 2 hallazgos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Diente 16, 1 hallazgo' })).toBeInTheDocument();
  });
});

describe('<ToothShape>: catálogo visual', () => {
  const surfaceOf = (container: HTMLElement, surface: string) => container.querySelector(`[data-surface="${surface}"] polygon`) as SVGPolygonElement;

  it('la caries va en rojo y la restauración en azul', () => {
    const { container } = render(
      <ToothShape toothCode={16} findings={[finding({ surface: 'OCCLUSAL', type: 'CARIES' }), finding({ surface: 'MESIAL', type: 'RESTORATION' })]} />,
    );
    expect(surfaceOf(container, 'OCCLUSAL').getAttribute('fill')).toBe(FINDING_TYPES.CARIES.color);
    expect(FINDING_TYPES.CARIES.color).toBe('#d94f4f');
    expect(surfaceOf(container, 'MESIAL').getAttribute('fill')).toBe(FINDING_TYPES.RESTORATION.color);
    expect(FINDING_TYPES.RESTORATION.color).toBe('#3b82c4');
    expect(surfaceOf(container, 'DISTAL').getAttribute('fill')).toBe('#ffffff');
  });

  it('no depende solo del color: cada hallazgo de superficie lleva una trama', () => {
    const { container } = render(<ToothShape toothCode={16} findings={[finding({ type: 'CARIES' })]} />);
    expect(container.querySelector('[data-surface="OCCLUSAL"] polygon[fill="url(#pat-dots)"]')).toBeInTheDocument();
    expect(FINDING_TYPES.RESTORATION.pattern).toBe('hatch');
    expect(FINDING_TYPES.SEALANT.pattern).toBe('grid');
  });

  it('distingue existente, planificado y realizado', () => {
    const planned = render(<ToothShape toothCode={16} findings={[finding({ status: 'PLANNED' })]} />);
    const polygon = surfaceOf(planned.container, 'OCCLUSAL');
    expect(polygon.getAttribute('fill-opacity')).toBe('0.3');
    expect(polygon.getAttribute('stroke-dasharray')).toBe('3 2');

    const existing = render(<ToothShape toothCode={16} findings={[finding({ status: 'EXISTING' })]} />);
    expect(surfaceOf(existing.container, 'OCCLUSAL').getAttribute('fill-opacity')).toBe('1');

    const done = render(<ToothShape toothCode={16} findings={[finding({ surface: 'WHOLE', type: 'ENDODONTICS_DONE', status: 'DONE' })]} />);
    expect(done.container.querySelector('circle[fill="#2a716e"]')).toBeInTheDocument(); // marca de verificación
  });

  it('dibuja los hallazgos de diente completo (exodoncia, implante, endodoncia, prótesis)', () => {
    for (const type of ['EXTRACTION', 'IMPLANT', 'ENDODONTICS_DONE', 'ENDODONTICS_REQUIRED', 'PROSTHESIS_FIXED', 'PROSTHESIS_REMOVABLE'] as const) {
      const { container, unmount } = render(<ToothShape toothCode={36} findings={[finding({ toothCode: 36, surface: 'WHOLE', type })]} />);
      expect(container.querySelector(`g[stroke="${FINDING_TYPES[type].color}"], rect[stroke="${FINDING_TYPES[type].color}"]`)).toBeInTheDocument();
      unmount();
    }
  });

  it('en el editor grande cada superficie es un botón táctil con su nombre', async () => {
    const onSelect = vi.fn();
    render(<ToothShape toothCode={16} findings={[]} size={140} showLabels onSurfaceSelect={onSelect} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
    await userEvent.click(screen.getByRole('button', { name: 'Vestibular' }));
    expect(onSelect).toHaveBeenCalledWith('VESTIBULAR');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Mesial' }), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('MESIAL');
  });

  it('en incisivos y caninos la superficie de masticación se llama «Incisal»', () => {
    render(<ToothShape toothCode={11} findings={[]} onSurfaceSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Incisal' })).toBeInTheDocument();
  });
});

describe('<OdontogramLegend>', () => {
  it('lista los 9 tipos del catálogo y los 3 estados', () => {
    render(<OdontogramLegend />);
    const legend = screen.getByLabelText('Leyenda del odontograma');
    for (const type of FINDING_ORDER) expect(within(legend).getByText(FINDING_TYPES[type].label)).toBeInTheDocument();
    expect(FINDING_ORDER).toHaveLength(9);
    for (const state of ['Existente', 'Planificado', 'Realizado']) expect(within(legend).getByText(state)).toBeInTheDocument();
  });
});

describe('<FindingPanel>: marcar superficies y hallazgos', () => {
  const setup = (overrides: Partial<React.ComponentProps<typeof FindingPanel>> = {}) => {
    const props = {
      toothCode: 46,
      findings: [] as Finding[],
      canEdit: true,
      busy: false,
      onAdd: vi.fn().mockResolvedValue(undefined),
      onChangeStatus: vi.fn().mockResolvedValue(undefined),
      onRemove: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    render(<FindingPanel {...props} />);
    return props;
  };

  it('marca una superficie con caries', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Mesial' }));
    await userEvent.click(screen.getByRole('radio', { name: /Caries/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar hallazgo' }));
    expect(props.onAdd).toHaveBeenCalledWith({ toothCode: 46, surface: 'MESIAL', type: 'CARIES', status: 'EXISTING', notes: undefined });
  });

  it('un hallazgo de diente completo (exodoncia planificada) no usa superficie', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('radio', { name: /Exodoncia/ }));
    await userEvent.click(screen.getByRole('radio', { name: 'Planificado' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar hallazgo' }));
    expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ surface: 'WHOLE', type: 'EXTRACTION', status: 'PLANNED' }));
  });

  it('ofrece los 9 tipos del catálogo', () => {
    setup();
    expect(screen.getAllByRole('radio').filter((r) => FINDING_ORDER.some((t) => r.textContent === FINDING_TYPES[t].label))).toHaveLength(9);
  });

  it('cambia el estado de un hallazgo y exige un motivo para quitarlo', async () => {
    const existing = finding({ toothCode: 46 });
    const props = setup({ findings: [existing] });
    await userEvent.selectOptions(screen.getByLabelText('Cambiar estado'), 'DONE');
    expect(props.onChangeStatus).toHaveBeenCalledWith(existing, 'DONE');

    await userEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Motivo de la corrección'), 'Diente equivocado');
    await userEvent.click(confirm);
    expect(props.onRemove).toHaveBeenCalledWith(existing, 'Diente equivocado');
  });

  it('en modo consulta no ofrece editar', () => {
    setup({ canEdit: false, findings: [finding({ toothCode: 46 })] });
    expect(screen.queryByRole('button', { name: 'Agregar hallazgo' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Cambiar estado')).not.toBeInTheDocument();
    expect(screen.getByText('Caries')).toBeInTheDocument();
  });
});
