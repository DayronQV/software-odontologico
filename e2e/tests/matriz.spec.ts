import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Matriz de navegadores y responsive (RNF-07, RNF-08): para cada navegador/dispositivo se inician sesión
 * (contraseña + código de recuperación MFA), se recorren las pantallas clave y se comprueba que cargan sin
 * errores de consola, sin desbordamiento horizontal de la página y con las funciones táctiles operativas.
 * Las capturas quedan en documentacion/evidencias/navegadores/<proyecto>/.
 */
const SESSIONS_FILE = join(__dirname, '..', 'sessions.json');
const SHOTS = join(__dirname, '..', '..', 'documentacion', 'evidencias', 'navegadores');

type Role = 'RECEPCIONISTA' | 'ODONTOLOGO' | 'AUDITOR' | 'ADMIN_TI';

/** Inicia sesión por la API (contraseña + código de recuperación de un solo uso) y deja el refresh en sessionStorage. */
async function signIn(page: Page, testInfo: TestInfo, role: Role): Promise<string> {
  const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
  const account = data.accounts[`${testInfo.project.name}:${role}`];
  const recoveryCode = account.recoveryCodes.shift();
  writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2));
  if (!recoveryCode) throw new Error(`Sin códigos de recuperación para ${account.email}: ejecute prepare-sessions.js`);

  const login = await page.request.post('/api/auth/login', { data: { email: account.email, password: data.password } });
  expect(login.ok()).toBeTruthy();
  const partial = (await login.json()).accessToken;
  const verified = await page.request.post('/api/auth/mfa/verify', {
    headers: { Authorization: `Bearer ${partial}` },
    data: { recoveryCode },
  });
  expect(verified.ok(), await verified.text()).toBeTruthy();
  const { refreshToken } = await verified.json();
  // Solo en la primera carga: el refresh rota y las navegaciones siguientes usan el token vigente
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('sigo.refresh')) sessionStorage.setItem('sigo.refresh', token);
  }, refreshToken);
  return data.patientId as string;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`excepción: ${e.message}`));
  page.on('console', (m) => {
    // Los 401/403 de comprobaciones previas son esperados; se ignoran errores de recursos externos.
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`consola: ${m.text()}`);
  });
  return errors;
}

async function shot(page: Page, testInfo: TestInfo, name: string) {
  const dir = join(SHOTS, testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

/** La página no debe desbordarse horizontalmente (las tablas pueden hacer scroll dentro de su contenedor). */
async function expectNoPageOverflow(page: Page) {
  await page.waitForLoadState('networkidle'); // evita abortar peticiones en vuelo al navegar
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'desbordamiento horizontal de la página (px)').toBeLessThanOrEqual(1);
}

const isTouch = (testInfo: TestInfo) => testInfo.project.name.startsWith('tablet');

test.describe('Recepción', () => {
  test('agenda, pacientes y punto de venta', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    const patientId = await signIn(page, testInfo, 'RECEPCIONISTA');
    await page.goto('/agenda');
    await expect(page.locator('.fc')).toBeVisible({ timeout: 30_000 });
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '01-agenda');

    await page.goto('/patients');
    await expect(page.getByRole('heading', { name: 'Pacientes' }).first()).toBeVisible();
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '02-pacientes');

    await page.goto(`/patients/${patientId}`);
    await expect(page.getByText(/Penicilina|Mendoza/).first()).toBeVisible({ timeout: 20_000 });
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '03-ficha-paciente');

    await page.goto('/billing/pos');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '04-punto-de-venta');
    expect(errors).toEqual([]);
  });
});

test.describe('Odontólogo', () => {
  test('odontograma 2D interactivo (clic o toque)', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    const patientId = await signIn(page, testInfo, 'ODONTOLOGO');
    await page.goto(`/patients/${patientId}/odontogram`);
    const odontogram = page.getByTestId('odontogram');
    await expect(odontogram).toBeVisible({ timeout: 30_000 });
    const teeth = odontogram.getByRole('button', { name: /^Diente / });
    expect(await teeth.count()).toBeGreaterThanOrEqual(32);
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '05-odontograma');

    const tooth = teeth.first();
    await tooth.scrollIntoViewIfNeeded();
    if (isTouch(testInfo)) await tooth.tap();
    else await tooth.click();
    await expect(page.locator('aside[aria-label^="Diente "]')).toBeVisible();
    await shot(page, testInfo, '06-odontograma-diente-seleccionado');
    expect(errors).toEqual([]);
  });

  test('periodontograma y evolución SOEP', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    const patientId = await signIn(page, testInfo, 'ODONTOLOGO');
    await page.goto(`/patients/${patientId}/perio`);
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '07-periodontograma');

    await page.goto(`/patients/${patientId}/evolution`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '08-evolucion-soep');
    expect(errors).toEqual([]);
  });

  test('firma en pantalla (consentimiento): el lienzo captura trazos', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    const patientId = await signIn(page, testInfo, 'ODONTOLOGO');
    await page.goto(`/patients/${patientId}/consents`);
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Nuevo consentimiento|Registrar consentimiento|Nuevo/ }).first().click();
    await shot(page, testInfo, '09-consentimientos');
    const dialog = page.getByRole('dialog');
    if (await dialog.isVisible().catch(() => false)) {
      // Elegir el primer procedimiento que exige consentimiento y generar el documento
      const select = dialog.getByRole('combobox').first();
      if (await select.isVisible().catch(() => false)) await select.selectOption({ index: 1 });
      const generate = dialog.getByRole('button', { name: /Generar|Continuar|Crear/ }).first();
      if (await generate.isVisible().catch(() => false)) await generate.click();
    }
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    const box = (await canvas.boundingBox())!;
    // Trazo con puntero (mouse en escritorio; en tableta se usa el mismo flujo de Pointer Events que el dedo)
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * 12, box.y + box.height / 2 + Math.sin(i) * 15);
    await page.mouse.up();
    const pixels = await canvas.evaluate((c: HTMLCanvasElement) => {
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let ink = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++;
      return ink;
    });
    expect(pixels).toBeGreaterThan(50);
    await shot(page, testInfo, '10-firma-en-pantalla');
    expect(errors).toEqual([]);
  });
});

test.describe('Auditor y administrador', () => {
  test('reportes y caja', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, testInfo, 'AUDITOR');
    await page.goto('/reports');
    await expect(page.getByTestId('dashboard')).toBeVisible({ timeout: 30_000 });
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '11-reportes-panel');
    await page.goto('/billing/cash');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '12-caja');
    expect(errors).toEqual([]);
  });

  test('auditoría y telemetría del sistema', async ({ page }, testInfo) => {
    const errors = watchErrors(page);
    await signIn(page, testInfo, 'ADMIN_TI');
    await page.goto('/audit');
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '13-auditoria');
    await page.goto('/admin/system');
    await expect(page.getByText('Estado de los servicios')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('En línea').first()).toBeVisible();
    await expectNoPageOverflow(page);
    await shot(page, testInfo, '14-sistema-y-respaldos');
    expect(errors).toEqual([]);
  });
});
