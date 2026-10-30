/** 23P01 = violación de una restricción de exclusión (solapamiento de citas, RN-03). */
export function isExclusionViolation(error: unknown): boolean {
  const text = `${(error as { message?: string })?.message ?? ''} ${JSON.stringify(
    (error as { meta?: unknown })?.meta ?? {},
  )}`;
  return text.includes('23P01') || /exclusion constraint/i.test(text);
}

/** Restricción única violada (código P2002 de Prisma). */
export function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}
