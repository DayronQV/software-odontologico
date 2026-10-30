import { Injectable } from '@nestjs/common';
import { SettingsService } from '../../catalog/settings/settings.service';
import { formatLocalDateTime } from '../../common/local-time';
import { pdfHeader, renderPdf } from '../../common/pdf';
import { PrismaService } from '../../prisma/prisma.service';
import { ClinicalLookupService } from '../shared/clinical-lookup.service';
import { formatPrescriptionNumber, PrescriptionsService } from './prescriptions.service';

/** PDF de la receta con los datos del profesional y del paciente. */
@Injectable()
export class PrescriptionPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescriptions: PrescriptionsService,
    private readonly lookup: ClinicalLookupService,
    private readonly settings: SettingsService,
  ) {}

  async render(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const row = await this.prescriptions.findOne(id);
    const [clinic, patient, prescriber] = await Promise.all([
      this.settings.get(),
      this.lookup.assertPatient(row.patientId),
      this.prisma.db.user.findUnique({
        where: { id: row.prescriberId },
        select: { fullName: true, professional: { select: { licenseNumber: true, specialty: true } } },
      }),
    ]);
    const number = formatPrescriptionNumber(row.number);

    const buffer = await renderPdf((doc) => {
      pdfHeader(doc, clinic.clinicName, `Receta odontológica ${number}`);
      doc
        .text(`Fecha: ${formatLocalDateTime(row.issuedAt, clinic.timezone)}`)
        .text(`Paciente: ${patient.firstName} ${patient.lastName}`)
        .text(
          `Profesional: ${prescriber?.fullName ?? '—'}` +
            (prescriber?.professional?.licenseNumber ? `  ·  Registro: ${prescriber.professional.licenseNumber}` : ''),
        );
      if (row.status === 'VOIDED') {
        doc.moveDown(0.5).fillColor('#b91c1c').fontSize(12).text(`ANULADA — ${row.voidReason ?? ''}`).fillColor('#000').fontSize(10);
      }
      if (row.diagnosis) doc.moveDown(0.5).text(`Diagnóstico: ${row.diagnosis}`);

      doc.moveDown().fontSize(12).text('Prescripción', { underline: true }).fontSize(10);
      row.items.forEach((item, index) => {
        doc.moveDown(0.5).fontSize(11).text(`${index + 1}. ${item.name}`).fontSize(10);
        doc.text(`   Dosis: ${item.dose}  ·  Frecuencia: ${item.frequency}  ·  Duración: ${item.duration}`);
        if (item.instructions) doc.text(`   Indicaciones: ${item.instructions}`);
      });
      if (row.notes) doc.moveDown().text(`Observaciones: ${row.notes}`);
      doc.moveDown(3).text('______________________________').text(prescriber?.fullName ?? '');
    });
    return { buffer, filename: `${number}.pdf` };
  }
}
