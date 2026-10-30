import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { QueueModule } from '../queue/queue.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [FilesModule, QueueModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
