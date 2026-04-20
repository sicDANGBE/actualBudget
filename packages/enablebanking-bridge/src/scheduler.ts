import type { Logger } from './logging.js';
import type { BridgeSyncService } from './sync/sync-service.js';
import type { BridgeConfig } from './types.js';

function cronToIntervalMs(cron: string) {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return 6 * 60 * 60 * 1000;
  }
  const hourPart = parts[1];
  const everyHours = hourPart.match(/^\*\/(\d+)$/);
  if (everyHours) {
    return Number(everyHours[1]) * 60 * 60 * 1000;
  }
  return 6 * 60 * 60 * 1000;
}

export class BridgeScheduler {
  private timer: NodeJS.Timeout | undefined;
  private isRunning = false;

  constructor(
    private readonly config: BridgeConfig,
    private readonly syncService: BridgeSyncService,
    private readonly logger: Logger,
  ) {}

  start() {
    if (!this.config.schedulerEnabled || this.timer) {
      return;
    }
    const intervalMs = cronToIntervalMs(this.config.schedulerDefaultCron);
    this.timer = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
    this.logger.info('Enable Banking scheduler started.', {
      intervalMs,
      cron: this.config.schedulerDefaultCron,
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async runOnce() {
    if (this.isRunning) {
      this.logger.warn(
        'Enable Banking scheduled sync skipped: already running.',
      );
      return;
    }
    this.isRunning = true;
    try {
      const results = await this.syncService.syncAll();
      this.logger.info('Enable Banking scheduled sync completed.', { results });
    } catch (error) {
      this.logger.error('Enable Banking scheduled sync failed.', {
        error: error instanceof Error ? error.message : error,
      });
    } finally {
      this.isRunning = false;
    }
  }
}
