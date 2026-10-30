import { loadBackupConfig } from './backup-config';
import { BackupService } from './backup-service';

const USAGE = `Uso: node dist/backup/cli.js <comando>
  backup                              respalda la base de datos (cifrada) y espeja los documentos
  list                                lista los respaldos disponibles
  prune                               elimina los respaldos que superan la retención
  restore <id> <DATABASE_URL> [--files]   restaura en la base indicada (y los documentos con --files)
  daemon                              ejecuta un respaldo diario a la hora BACKUP_HOUR (zona horaria TZ)`;

/** Milisegundos hasta la próxima ocurrencia de la hora local indicada. */
export function msUntilNext(hour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const config = loadBackupConfig();
  const service = new BackupService(config);

  switch (command) {
    case 'backup':
      await service.backup();
      return;
    case 'list':
      for (const m of await service.list()) {
        console.log(`${m.id}  ${m.createdAt}  BD ${m.database.bytes} B  documentos ${m.files.total}`);
      }
      return;
    case 'prune':
      console.log(`Eliminados: ${await service.prune()}`);
      return;
    case 'restore': {
      const [id, url] = args;
      if (!id || !url) throw new Error(USAGE);
      await service.restore(id, url, { files: args.includes('--files') });
      return;
    }
    case 'daemon':
      for (;;) {
        const wait = msUntilNext(config.BACKUP_HOUR);
        console.log(`Próximo respaldo en ${Math.round(wait / 60000)} min`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          await service.backup();
        } catch (error) {
          console.error('Respaldo fallido:', error instanceof Error ? error.message : error);
        }
      }
    default:
      throw new Error(USAGE);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
