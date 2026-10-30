/** Un consentimiento firmado vale para ese paciente y procedimiento durante un año. */
export const CONSENT_VALIDITY_DAYS = 365;

export interface ConsentVariables {
  clinica: string;
  paciente: string;
  procedimiento: string;
  profesional: string;
  fecha: string;
  diente: string;
}

/** Reemplaza {{variables}} del texto legal con los datos del paciente, procedimiento y profesional. */
export function renderConsentText(template: string, variables: ConsentVariables): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    name in variables ? variables[name as keyof ConsentVariables] : match,
  );
}

/** Texto legal básico que se carga como plantilla inicial de cada procedimiento. */
export const DEFAULT_CONSENT_BODY = [
  'Yo, {{paciente}}, declaro que el/la Dr./Dra. {{profesional}} de {{clinica}} me explicó, en palabras que pude entender, el procedimiento «{{procedimiento}}» {{diente}}, su objetivo, la forma en que se realiza, las alternativas de tratamiento y las consecuencias de no tratarme.',
  'Fui informado/a de los riesgos y molestias posibles, entre ellos: dolor o inflamación posteriores, sangrado, reacciones a los medicamentos o anestésicos, y la posibilidad de que se requieran tratamientos adicionales. Ningún tratamiento ofrece garantía absoluta de resultado.',
  'Tuve la oportunidad de hacer preguntas y fueron respondidas a mi satisfacción. Declaré con veracidad mi historial médico, alergias y medicamentos. Autorizo la realización del procedimiento y el uso de anestesia local si fuera necesario.',
  'Entiendo que puedo retirar este consentimiento antes del procedimiento. Fecha: {{fecha}}.',
].join('\n\n');
