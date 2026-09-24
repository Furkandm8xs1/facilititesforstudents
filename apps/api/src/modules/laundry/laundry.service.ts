import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { LaundryRuleError } from './laundry.errors';
import {
  parseCustomerSearchInput,
  parseLoadId,
  parseRefundInput,
  parseStartRunInput,
  parseTariffInput,
  parseTransferInput,
} from './laundry.input';
import { LaundryRepository } from './laundry.repository';

@Injectable()
export class LaundryService {
  constructor(private readonly laundry: LaundryRepository) {}

  getConfig() {
    return this.handle(() => this.laundry.getConfig());
  }

  getMyLoads(subject: string) {
    return this.handle(() => this.laundry.getMyLoads(subject));
  }

  getManagementView() {
    return this.handle(() => this.laundry.getManagementView());
  }

  searchCustomers(rawInput: unknown) {
    const phone = parseCustomerSearchInput(rawInput);
    return this.handle(() => this.laundry.searchCustomers(phone));
  }

  createLoad(subject: string, rawInput: unknown) {
    const input = parseStartRunInput(rawInput);
    return this.handle(() =>
      this.laundry.createLoad({ actorSubject: subject, ...input }),
    );
  }

  transferLoad(subject: string, loadIdValue: unknown, rawInput: unknown) {
    const loadId = parseLoadId(loadIdValue);
    const input = parseTransferInput(rawInput);
    return this.handle(() =>
      this.laundry.transferLoad({ actorSubject: subject, loadId, ...input }),
    );
  }

  completeLoad(subject: string, loadIdValue: unknown) {
    const loadId = parseLoadId(loadIdValue);
    return this.handle(() =>
      this.laundry.completeLoad({ actorSubject: subject, loadId }),
    );
  }

  refundLoad(subject: string, loadIdValue: unknown, rawInput: unknown) {
    const loadId = parseLoadId(loadIdValue);
    const input = parseRefundInput(rawInput);
    return this.handle(() =>
      this.laundry.refundLoad({ actorSubject: subject, loadId, ...input }),
    );
  }

  updateTariffs(subject: string, rawInput: unknown) {
    const input = parseTariffInput(rawInput);
    return this.handle(() =>
      this.laundry.updateTariffs({ actorSubject: subject, ...input }),
    );
  }

  private async handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof LaundryRuleError)) throw error;
      switch (error.code) {
        case 'SERVICE_NOT_FOUND':
          throw new ServiceUnavailableException(
            'Çamaşırhane hizmeti henüz hazır değil.',
          );
        case 'ACTOR_PROFILE_NOT_FOUND':
          throw new ForbiddenException(
            'Aktif bir çamaşırhane görevlisi profili gereklidir.',
          );
        case 'CUSTOMER_NOT_FOUND':
          throw new NotFoundException(
            'Bu telefon numarasıyla kullanıcı ve cüzdan bulunamadı.',
          );
        case 'CUSTOMER_NOT_ACTIVE':
          throw new ConflictException('Kullanıcının profili aktif değil.');
        case 'LOAD_NOT_FOUND':
          throw new NotFoundException('Çamaşır yükü bulunamadı.');
        case 'LOAD_STATE_CONFLICT':
          throw new ConflictException(
            'Çamaşır yükü mevcut durumunda bu işleme uygun değil.',
          );
        case 'MACHINE_OCCUPIED':
          throw new ConflictException('Seçilen makine şu anda dolu.');
        case 'SAME_MACHINE':
          throw new ConflictException(
            'Çamaşır yükü zaten seçilen makinede bulunuyor.',
          );
        case 'INSUFFICIENT_BALANCE':
          throw new ConflictException(
            'Çamaşırhane işlemi için kullanılabilir bakiye yetersiz.',
          );
        case 'IDEMPOTENCY_CONFLICT':
          throw new ConflictException(
            'İşlem güvenlik anahtarı başka bir işlemde kullanılmış.',
          );
      }
    }
  }
}
