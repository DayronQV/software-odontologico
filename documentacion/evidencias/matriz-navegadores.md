# Matriz de navegadores y dispositivos (RNF-07, RNF-08)

Ejecutada con Playwright (`e2e/`, `npx playwright test`) el 30/10/2026 contra el sistema en Docker (TLS 1.3, https://localhost).
Cada perfil recorre 6 pruebas con sesión real (contraseña + MFA): agenda/pacientes/ficha/POS (recepción); odontograma con clic o **toque**; periodontograma y evolución; **firma en pantalla** (el lienzo registra el trazo); reportes y caja; auditoría y telemetría.
Cada prueba exige: sin errores de consola ni excepciones, **sin desbordamiento horizontal** de la página y funciones táctiles operativas.

| Perfil | Motor / navegador representado | Viewport | Resultado |
|---|---|---|---|
| chromium-1920 | Chromium → Chrome y Edge | 1920×1080 | 6/6 ✔ |
| firefox-1920 | Firefox | 1920×1080 | 6/6 ✔ |
| webkit-1920 | WebKit → Safari | 1920×1080 | 6/6 ✔ |
| chromium-1366 | Chromium → Chrome y Edge | 1366×768 | 6/6 ✔ |
| firefox-1366 | Firefox | 1366×768 | 6/6 ✔ |
| webkit-1366 | WebKit → Safari | 1366×768 | 6/6 ✔ |
| tablet-ipad-webkit | Safari iPad Pro 11" (táctil) | 1194×834 horizontal | 6/6 ✔ |
| tablet-ipad-vertical-webkit | Safari iPad Pro 11" (táctil) | 834×1194 vertical | 6/6 ✔ |
| tablet-android-chromium | Chrome tableta 10,5" (táctil) | 1280×800 | 6/6 ✔ |

**Total: 54/54 pruebas aprobadas.** Capturas en `documentacion/evidencias/navegadores/<perfil>/`.

Limitaciones honestas: Edge se valida a través de Chromium (mismo motor); Safari a través de WebKit de Playwright (no el binario de macOS); las "últimas 2 versiones" son las que instala Playwright. Defectos hallados y corregidos durante la matriz: fuente de FullCalendar bloqueada por el CSP, `eval` de zod 4 bloqueado por el CSP (Firefox), desbordamiento de Reportes/POS en iPad vertical.
