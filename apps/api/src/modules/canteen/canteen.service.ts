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
  parseOrderId,
  parseOrderingInput,
  parseOrderTransitionInput,
  parsePlaceOrderInput,
} from './canteen-order.input';
import { CanteenOrderRepository } from './canteen-order.repository';
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
  constructor(
    private readonly canteen: CanteenRepository,
    private readonly orders: CanteenOrderRepository,
  ) {}

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

  async placeOrder(subject: string, rawInput: unknown) {
    const input = parsePlaceOrderInput(rawInput);

    try {
      return await this.orders.placeOrder({
        customerSubject: subject,
        ...input,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async listCustomerOrders(subject: string) {
    try {
      return await this.orders.listCustomerOrders(subject);
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async cancelCustomerOrder(subject: string, orderIdValue: unknown) {
    const orderId = parseOrderId(orderIdValue);

    try {
      return await this.orders.cancelCustomerOrder({
        customerSubject: subject,
        orderId,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async listManagementOrders() {
    try {
      return await this.orders.listManagementOrders();
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async transitionOrder(
    subject: string,
    orderIdValue: unknown,
    rawInput: unknown,
  ) {
    const orderId = parseOrderId(orderIdValue);
    const transition = parseOrderTransitionInput(rawInput);

    try {
      return await this.orders.transitionOrder({
        actorSubject: subject,
        orderId,
        ...transition,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async setOrderingEnabled(subject: string, rawInput: unknown) {
    const enabled = parseOrderingInput(rawInput);

    try {
      return await this.orders.setOrderingEnabled({
        actorSubject: subject,
        enabled,
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
      case 'CUSTOMER_PROFILE_NOT_FOUND':
        throw new ForbiddenException(
          'Sipariş için aktif bir kullanıcı ve cüzdan hesabı gereklidir.',
        );
      case 'CANTEEN_CLOSED':
        throw new ConflictException('Ana Kantin şu anda siparişe kapalı.');
      case 'PRODUCT_UNAVAILABLE':
        throw new ConflictException(
          'Siparişteki ürünlerden biri artık satışta değil.',
        );
      case 'INSUFFICIENT_STOCK':
        throw new ConflictException('Seçilen adet için yeterli stok yok.');
      case 'WALLET_NOT_FOUND':
        throw new NotFoundException('Kullanıcının cüzdan hesabı bulunamadı.');
      case 'INSUFFICIENT_BALANCE':
        throw new ConflictException(
          'Sipariş için kullanılabilir bakiye yetersiz.',
        );
      case 'ORDER_TOTAL_TOO_LARGE':
        throw new BadRequestException(
          'Sipariş toplamı desteklenen sınırı aşıyor.',
        );
      case 'ORDER_NOT_FOUND':
        throw new NotFoundException('Sipariş bulunamadı.');
      case 'ORDER_STATE_CONFLICT':
        throw new ConflictException(
          'Sipariş mevcut durumunda bu işleme uygun değil.',
        );
      case 'DELIVERY_CODE_INVALID':
        throw new BadRequestException('Teslim kodu doğru değil.');
      case 'IDEMPOTENCY_CONFLICT':
        throw new ConflictException(
          'Sipariş güvenlik anahtarı başka bir işlemde kullanılmış.',
        );
    }
  }
}
