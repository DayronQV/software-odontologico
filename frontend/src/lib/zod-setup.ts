import { z } from 'zod';

// El CSP (script-src 'self') prohíbe eval: zod 4 compila validadores con `new Function` salvo en modo jitless.
// Debe importarse ANTES que cualquier módulo que cree esquemas (los esquemas se construyen al importar).
z.config({ jitless: true });
