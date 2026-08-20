import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { CanteenRuleError } from './canteen.errors';
import {
  parseCreateProductInput,
  parseProductId,
  parseStockInput,
  parseUpdateProductDetailsInput,
  parseVisibilityInput,
} from './canteen.input';
import { CanteenRepository } from './canteen.repository';

@Injectable()
export class CanteenService {
  constructor(private readonly canteen: CanteenRepository) {}

  async getCustomerCatalog() {
    try {
      return await this.canteen.getCustomerCatalog();
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async getManagementCatalog() {
    try {
      return await this.canteen.getManagementCatalog();
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async createOrUpdateProduct(subject: string, rawInput: unknown) {
    const input = parseCreateProductInput(rawInput);

    try {
      return await this.canteen.createOrUpdateProduct({
        actorSubject: subject,
        ...input,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async updateProductDetails(
    subject: string,
    productIdValue: unknown,
    rawInput: unknown,
  ) {
    const productId = parseProductId(productIdValue);
    const input = parseUpdateProductDetailsInput(rawInput);

    try {
      return await this.canteen.updateProductDetails({
        actorSubject: subject,
        productId,
        ...input,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async setProductStock(
    subject: string,
    productIdValue: unknown,
    rawInput: unknown,
  ) {
    const productId = parseProductId(productIdValue);
    const stockOnHand = parseStockInput(rawInput);

    try {
      return await this.canteen.setProductStock({
        actorSubject: subject,
        productId,
        stockOnHand,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async setProductVisibility(
    subject: string,
    productIdValue: unknown,
    rawInput: unknown,
  ) {
    const productId = parseProductId(productIdValue);
    const listed = parseVisibilityInput(rawInput);

    try {
      return await this.canteen.setProductVisibility({
        actorSubject: subject,
        productId,
        listed,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async archiveProduct(subject: string, productIdValue: unknown) {
    const productId = parseProductId(productIdValue);

    try {
      return await this.canteen.archiveProduct({
        actorSubject: subject,
        productId,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  private rethrowRuleError(error: unknown): never {
    if (!(error instanceof CanteenRuleError)) {
      throw error;
    }

    switch (error.code) {
      case 'ACTOR_PROFILE_NOT_FOUND':
        throw new ForbiddenException(
          'Aktif bir kantin görevlisi profiliyle işlem yapılmalıdır.',
        );
      case 'MAIN_CANTEEN_NOT_FOUND':
        throw new ServiceUnavailableException('Ana Kantin kaydı hazır değil.');
      case 'PRODUCT_NOT_FOUND':
        throw new NotFoundException('Ürün bulunamadı.');
      case 'PRODUCT_NAME_CONFLICT':
        throw new ConflictException(
          'Ana Kantin’de bu adla başka bir ürün bulunuyor.',
        );
      case 'STOCK_BELOW_RESERVED':
        throw new ConflictException(
          'Stok, rezerve edilmiş ürün miktarının altına indirilemez.',
        );
      case 'PRODUCT_ARCHIVED':
        throw new BadRequestException(
          'Arşivlenmiş ürün doğrudan satışa açılamaz.',
        );
      case 'PRODUCT_HAS_RESERVATIONS':
        throw new ConflictException('Rezerve stoğu bulunan ürün arşivlenemez.');
    }
  }
}
