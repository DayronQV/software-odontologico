# Manual de usuario de SIGO-Dental

Sistema Integral de Gestión Odontológica y Expediente Clínico Digital. Este manual explica, por perfil, lo que cada
persona puede hacer. **Cada usuario solo ve en el menú lo que su rol permite** (principio de menor privilegio).

## 1. Ingreso, MFA y seguridad (todos los perfiles)

1. Abra la dirección del sistema e ingrese con su correo y contraseña (mínimo 12 caracteres con mayúscula, minúscula, número y símbolo).
2. **Primer ingreso:** el sistema muestra un código QR. Escanéelo con una app autenticadora (Google Authenticator, Microsoft
   Authenticator, Authy…), escriba el código de 6 dígitos y **guarde los códigos de recuperación** (se muestran una sola vez).
3. En los ingresos siguientes escriba el código de 6 dígitos de la app. Si pierde el teléfono, use un código de recuperación (cada uno sirve una vez) y avise al administrador de TI.
4. **Cierre automático:** tras 15 minutos sin actividad la sesión se cierra (un aviso le permite continuar). Cierre sesión siempre al dejar el puesto.
5. *Mi cuenta → Contraseña* para cambiar su clave. Tras 5 intentos fallidos en un minuto el sistema espera antes de aceptar otro.

Todo lo que se consulta o modifica en la historia clínica queda registrado (quién, qué, cuándo, desde qué IP) en un log que no se puede alterar.

## 2. Recepcionista (agenda, pacientes, caja)

**Pacientes** — *Pacientes → Nuevo paciente*: datos demográficos, contacto, canal preferido de recordatorios, contacto de
emergencia, seguro/convenio. Si es **menor de edad** el sistema exige el **tutor legal**. La anamnesis (enfermedades, alergias,
cirugías, coagulopatías) es obligatoria antes de atender; si hay una condición crítica (p. ej. alergia a la penicilina o
anticoagulación) aparece una **insignia roja** en la cabecera del expediente.

**Agenda** — vista de día/semana, filtrable por consultorio/sillón y profesional. Cree una cita eligiendo paciente,
profesional, sillón, procedimiento y hora; para moverla use «Reprogramar» en su detalle. El sistema **impide dos citas simultáneas en el mismo
sillón** aunque cambie el profesional. Estados: Programado → Confirmado → En sala de espera → En atención → Atendido
(también Cancelado y No asistió). Los recordatorios salen automáticamente 48 h y 24 h antes por WhatsApp/SMS/correo.

**Sala de espera** — vea quién llegó y marque «En sala de espera» al recibirlo.

**Punto de venta** — *Punto de venta*: seleccione paciente y servicios, aplique descuento (hasta el máximo configurado; más
requiere autorización del administrador), registre **pagos mixtos** (efectivo, tarjeta, transferencia, seguro) y emita el comprobante (PDF).
**Caja** — *Caja → Abrir caja*, y al cerrar **cuente el dinero sin ver el total esperado** (cierre ciego); luego el sistema muestra la diferencia.

## 3. Odontólogo (historia clínica)

**Expediente** — abra el paciente: cabecera con alertas críticas, línea de tiempo y pestañas.
- **Odontograma** (2D): 32 dientes permanentes y 20 temporales, numeración FDI o Universal, 5 superficies por diente.
  Toque un diente/superficie y elija el hallazgo (caries, restauración, endodoncia, implante, prótesis, exodoncia, sellante…).
  Los hallazgos conservan historial.
- **Periodontograma:** 6 puntos por diente (profundidad, margen gingival, sangrado), furca y movilidad; el NIC se calcula solo.
- **Evolución (SOEP):** escriba Subjetivo/Objetivo/Evaluación/Plan. La nota es editable por 24 h (configurable); después se
  bloquea. **Firme** con su contraseña (se guarda una huella SHA-256). Para corregir una nota o un procedimiento realizado use
  una **adenda firmada**: lo realizado nunca se borra.
- **Consentimiento informado:** por procedimiento, con firma en pantalla táctil o código OTP enviado al paciente.
- **Recetas:** el sistema **avisa si el medicamento choca con las alergias** del paciente. Genera PDF.
- **Plan de tratamiento y presupuestos:** por fases/sesiones con honorarios, laboratorio y descuentos; el paciente aprueba total o
  parcialmente y los ítems aprobados pasan a **tareas agendables**.
- **Adjuntos:** radiografías, fotos y PDFs (hasta 15 MB; se verifica el contenido). Visor con zoom y rotación.
- **Mis comisiones** (*Comisiones*): sus honorarios por período.

## 4. Asistente dental

Registra **signos vitales** del paciente antes de la consulta, escribe **notas clínicas** propias (marcadas como del asistente),
sube adjuntos y gestiona el **inventario** (*Inventario*: existencias por consultorio y por profesional, entradas con
lote/vencimiento, traslados y ajustes con motivo). Al completar un procedimiento el sistema **descuenta los insumos** de
la receta de consumo; si falta stock avisa (o bloquea, según la política configurada).

## 5. Administrador de TI

*Administración*: usuarios (alta, cambio de rol, activar/desactivar), consultorios y sillones, profesionales y horarios,
catálogo de procedimientos y precios (con receta de consumo), seguros y convenios, reglas de alertas médicas, plantillas de
consentimiento, medicamentos, autorización de descuentos y parámetros (horario de la clínica, moneda, impuestos, horas de bloqueo de notas,
política de stock). **Sistema y respaldos:** estado de servicios, cola, actividad y respaldos cifrados. *Auditoría:* consulta
por usuario/acción/entidad/fecha y **verificación de la cadena de hashes**. *Reportes*: panel de indicadores y exportación (cada
exportación queda auditada). El administrador **no** accede a los datos clínicos de los pacientes.

## 6. Auditor / Contador

Acceso de solo lectura a lo financiero y de control: **Comprobantes**, **Caja** (cortes), **Comisiones** (calcula, aprueba y
marca pagadas las liquidaciones de honorarios; reglas: % fijo, monto fijo por procedimiento o % tras descontar laboratorio y materiales),
**Inventario**, **Reportes** (ingresos, agenda, honorarios, inventario valorizado, caja; exportables a PDF/CSV) y **Auditoría**.
No ve datos clínicos de pacientes.

## 7. Dispositivos y navegadores

Uso en computador (1920×1080, 1366×768) y **tableta de 10,5" o más** (odontograma, periodontograma y firma funcionan con el dedo).
Navegadores compatibles: últimas 2 versiones de Chrome, Firefox, Edge y Safari.

## 8. Ayuda rápida

| Problema | Solución |
|---|---|
| «Código incorrecto» | Revise la hora del teléfono (debe ser automática) y espere el siguiente código; no reutilice uno ya usado |
| No veo un menú | Su rol no lo permite; pida el cambio al administrador |
| No puedo agendar | Hay otra cita en ese sillón/hora, o el profesional no atiende en ese horario |
| La nota no se puede editar | Pasó el plazo de bloqueo: use una adenda firmada |
| No deja cerrar la caja | Cuente y escriba el efectivo contado; el total esperado se muestra después |
