import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { FilesModule } from '../files/files.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OtpDeliveryService } from './otp-delivery.service';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

/** Firma del paciente (táctil u OTP), compartida por consentimientos y aprobación de presupuestos. */
@Module({
  imports: [CatalogModule, FilesModule, IntegrationsModule],
  controllers: [SigningController],
  providers: [SigningService, OtpDeliveryService],
  exports: [SigningService],
})
export class SigningModule {}
