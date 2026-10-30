import { DEFAULT_CONSENT_BODY, renderConsentText } from './consent-text';

const variables = {
  clinica: 'Clínica SIGO',
  paciente: 'Carlos Mendoza',
  procedimiento: 'Endodoncia multirradicular',
  profesional: 'Andrés Salazar',
  fecha: '02/11/2026 10:00',
  diente: '(diente 46)',
};

describe('texto del consentimiento (RF-06)', () => {
  it('completa los datos del paciente, procedimiento y profesional', () => {
    const text = renderConsentText(DEFAULT_CONSENT_BODY, variables);
    expect(text).toContain('Carlos Mendoza');
    expect(text).toContain('«Endodoncia multirradicular» (diente 46)');
    expect(text).toContain('Andrés Salazar');
    expect(text).toContain('Clínica SIGO');
    expect(text).not.toMatch(/\{\{/);
  });

  it('admite espacios dentro de las llaves y deja intactas las variables desconocidas', () => {
    expect(renderConsentText('Hola {{ paciente }} {{desconocida}}', variables)).toBe('Hola Carlos Mendoza {{desconocida}}');
  });
});
