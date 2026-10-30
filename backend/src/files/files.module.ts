import { Module } from '@nestjs/common';
import { BlobStorageService } from './blob-storage.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  controllers: [FilesController],
  providers: [FilesService, BlobStorageService],
  exports: [FilesService, BlobStorageService],
})
export class FilesModule {}
