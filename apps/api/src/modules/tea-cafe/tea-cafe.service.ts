import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';

import { TeaCafeRuleError } from './tea-cafe.errors';
import { parseBrewId, parseCreateBrewInput } from './tea-cafe.input';
import { TeaCafeRepository } from './tea-cafe.repository';

@Injectable()
export class TeaCafeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TeaCafeService.name);
  private expiryTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly teaCafe: TeaCafeRepository) {}

  onModuleInit() {
    void this.removeExpiredBrews();
    this.expiryTimer = setInterval(
      () => void this.removeExpiredBrews(),
      60_000,
    );
  }

  onModuleDestroy() {
    if (this.expiryTimer) {
      clearInterval(this.expiryTimer);
    }
  }

  async listBrews() {
    try {
      return {
        brews: await this.teaCafe.listVisibleBrews(),
        serverTime: new Date(),
      };
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async createBrew(subject: string, rawInput: unknown) {
    const input = parseCreateBrewInput(rawInput);

    try {
      return await this.teaCafe.createBrew({ actorSubject: subject, ...input });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async deleteBrew(subject: string, brewIdValue: unknown) {
    const brewId = parseBrewId(brewIdValue);

    try {
      await this.teaCafe.deleteBrew({ actorSubject: subject, brewId });
      return { deleted: true };
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  private async removeExpiredBrews() {
    try {
      await this.teaCafe.deleteExpiredBrews();
    } catch (error) {
      this.logger.error('Süresi dolan demlemeler silinemedi.', error);
    }
  }

  private rethrowRuleError(error: unknown): never {
    if (!(error instanceof TeaCafeRuleError)) {
      throw error;
    }

    switch (error.code) {
      case 'ACTOR_PROFILE_NOT_FOUND':
        throw new ForbiddenException(
          'Aktif bir çayhane görevlisi profiliyle işlem yapılmalıdır.',
        );
      case 'SERVICE_UNIT_NOT_FOUND':
        throw new ServiceUnavailableException(
          'Tea & Cafe hizmeti hazır değil.',
        );
      case 'BREW_NOT_FOUND':
        throw new NotFoundException('Demleme kaydı bulunamadı.');
    }
  }
}
