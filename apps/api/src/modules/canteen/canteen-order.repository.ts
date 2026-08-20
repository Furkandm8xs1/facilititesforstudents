import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PostgresService } from '../../database/postgres.service';
import type { ManagementOrderStatus } from './canteen-order.input';
import { CanteenRuleError } from './canteen.errors';

export type CanteenOrderStatus =
  | 'PLACED'
  | 'PREPARING'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'CANCELLED_BY_CANTEEN';

export interface CanteenOrderItemView {
  productId: string;
  productName: string;
  unitPriceMinor: string;
  quantity: string;
  lineTotalMinor: string;
}

export interface CanteenOrderView {
  id: string;
  status: CanteenOrderStatus;
  totalMinor: string;
  customerName: string;
  customerPhone: string;
  items: CanteenOrderItemView[];
  createdAt: Date;
  updatedAt: Date;
}

interface OrderRow {
  id: string;
  canteen_id: string;
  customer_user_profile_id: string;
  status: CanteenOrderStatus;
  total_minor: string;
  customer_name: string;
  customer_phone: string;
  items: Array<{
    productId: string;
    productName: string;
    unitPriceMinor: string;
    quantity: string;
    lineTotalMinor: string;
  }>;
  created_at: Date;
  updated_at: Date;
}

interface CustomerAccountRow {
  profile_id: string;
  account_id: string;
  available_minor: string;
}

interface StoreRow {
  id: string;
  ordering_enabled: boolean;
}

interface OrderProductRow {
  id: string;
  canteen_id: string;
  name: string;
  price_minor: string;
  stock_on_hand: string;
  stock_reserved: string;
  listed: boolean;
  archived_at: Date | null;
}

interface LockedOrderRow {
  id: string;
  canteen_id: string;
  customer_user_profile_id: string;
  status: CanteenOrderStatus;
  total_minor: string;
  account_id: string;
}

interface LockedOrderBaseRow {
  id: string;
  canteen_id: string;
  customer_user_profile_id: string;
  status: CanteenOrderStatus;
  total_minor: string;
}

interface LockedAccountRow {
  account_id: string;
}

interface OrderItemRow {
  product_id: string;
  quantity: string;
}

const allowedTransitions: Record<CanteenOrderStatus, CanteenOrderStatus[]> = {
  PLACED: ['PREPARING', 'CANCELLED', 'CANCELLED_BY_CANTEEN'],
  PREPARING: ['READY', 'CANCELLED_BY_CANTEEN'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  CANCELLED_BY_CANTEEN: [],
};
const maxMinor = 9_223_372_036_854_775_807n;

function orderView(row: OrderRow): CanteenOrderView {
  return {
    id: row.id,
    status: row.status,
    totalMinor: row.total_minor,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: row.items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class CanteenOrderRepository {
  constructor(private readonly postgres: PostgresService) {}

  async placeOrder(input: {
    customerSubject: string;
    items: Array<{ productId: string; quantity: bigint }>;
    idempotencyKey: string;
  }): Promise<CanteenOrderView> {
    return this.postgres.withTransaction(async (client) => {
      const customer = await this.lockCustomerAccount(
        client,
        input.customerSubject,
      );

      if (!customer) {
        throw new CanteenRuleError('CUSTOMER_PROFILE_NOT_FOUND');
      }

      const duplicate = await client.query<{
        id: string;
        customer_user_profile_id: string;
      }>(
        `SELECT id, customer_user_profile_id
        FROM canteen.customer_order
        WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );

      if (duplicate.rows[0]) {
        if (
          duplicate.rows[0].customer_user_profile_id !== customer.profile_id
        ) {
          throw new CanteenRuleError('IDEMPOTENCY_CONFLICT');
        }

        return this.getOrder(client, duplicate.rows[0].id);
      }

      const store = await this.lockMainStore(client);

      if (!store) {
        throw new CanteenRuleError('MAIN_CANTEEN_NOT_FOUND');
      }

      if (!store.ordering_enabled) {
        throw new CanteenRuleError('CANTEEN_CLOSED');
      }

      const requested = new Map(
        input.items.map((item) => [item.productId, item.quantity]),
      );
      const productIds = [...requested.keys()].sort();
      const products = await this.lockProducts(client, store.id, productIds);

      if (products.length !== productIds.length) {
        throw new CanteenRuleError('PRODUCT_UNAVAILABLE');
      }

      let totalMinor = 0n;

      for (const product of products) {
        if (product.archived_at || !product.listed) {
          throw new CanteenRuleError('PRODUCT_UNAVAILABLE');
        }

        const quantity = requested.get(product.id)!;
        const available =
          BigInt(product.stock_on_hand) - BigInt(product.stock_reserved);

        if (available < quantity) {
          throw new CanteenRuleError('INSUFFICIENT_STOCK');
        }

        const lineTotal = BigInt(product.price_minor) * quantity;

        if (lineTotal > maxMinor || totalMinor > maxMinor - lineTotal) {
          throw new CanteenRuleError('ORDER_TOTAL_TOO_LARGE');
        }

        totalMinor += lineTotal;
      }

      if (BigInt(customer.available_minor) < totalMinor) {
        throw new CanteenRuleError('INSUFFICIENT_BALANCE');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO canteen.customer_order (
          canteen_id,
          customer_user_profile_id,
          total_minor,
          idempotency_key
        ) VALUES ($1, $2, $3, $4)
        RETURNING id`,
        [
          store.id,
          customer.profile_id,
          totalMinor.toString(),
          input.idempotencyKey,
        ],
      );
      const orderId = inserted.rows[0].id;

      for (const product of products) {
        const quantity = requested.get(product.id)!;
        const unitPriceMinor = BigInt(product.price_minor);

        await client.query(
          `INSERT INTO canteen.order_item (
            order_id,
            product_id,
            product_name,
            unit_price_minor,
            quantity,
            line_total_minor
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            orderId,
            product.id,
            product.name,
            unitPriceMinor.toString(),
            quantity.toString(),
            (unitPriceMinor * quantity).toString(),
          ],
        );

        await client.query(
          `UPDATE canteen.product
          SET stock_on_hand = stock_on_hand - $2,
              updated_at = now()
          WHERE id = $1`,
          [product.id, quantity.toString()],
        );
      }

      await client.query(
        `INSERT INTO wallet.ledger_entry (
          account_id,
          entry_type,
          available_delta_minor,
          held_delta_minor,
          idempotency_key,
          actor_user_profile_id,
          service_code,
          reference_id
        ) VALUES ($1, 'HOLD', $2, $3, $4, $5, 'canteen-main', $6)`,
        [
          customer.account_id,
          (-totalMinor).toString(),
          totalMinor.toString(),
          `canteen-order-hold:${orderId}`,
          customer.profile_id,
          orderId,
        ],
      );

      await client.query(
        `INSERT INTO wallet.ledger_entry (
          account_id,
          entry_type,
          available_delta_minor,
          held_delta_minor,
          idempotency_key,
          actor_user_profile_id,
          service_code,
          reference_id
        ) VALUES ($1, 'CAPTURE', 0, $2, $3, $4, 'canteen-main', $5)`,
        [
          customer.account_id,
          (-totalMinor).toString(),
          `canteen-order-capture:${orderId}`,
          customer.profile_id,
          orderId,
        ],
      );

      await client.query(
        `UPDATE wallet.account
        SET available_minor = available_minor - $2,
            updated_at = now()
        WHERE id = $1`,
        [customer.account_id, totalMinor.toString()],
      );

      await this.recordEvent(
        client,
        orderId,
        null,
        'PLACED',
        customer.profile_id,
      );

      return this.getOrder(client, orderId);
    });
  }

  async listCustomerOrders(subject: string): Promise<CanteenOrderView[]> {
    const profile = await this.postgres.query<{ id: string }>(
      `SELECT id FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    if (!profile.rows[0]) {
      throw new CanteenRuleError('CUSTOMER_PROFILE_NOT_FOUND');
    }

    return this.listOrders('orders.customer_user_profile_id = $1', [
      profile.rows[0].id,
    ]);
  }

  async listManagementOrders(): Promise<CanteenOrderView[]> {
    return this.listOrders("service.code = 'canteen-main'", []);
  }

  async cancelCustomerOrder(input: {
    customerSubject: string;
    orderId: string;
  }): Promise<CanteenOrderView> {
    return this.postgres.withTransaction(async (client) => {
      const customer = await this.findCustomerProfile(
        client,
        input.customerSubject,
      );

      if (!customer) {
        throw new CanteenRuleError('CUSTOMER_PROFILE_NOT_FOUND');
      }

      const order = await this.lockOrder(client, input.orderId);

      if (!order || order.customer_user_profile_id !== customer.id) {
        throw new CanteenRuleError('ORDER_NOT_FOUND');
      }

      if (order.status !== 'PLACED') {
        throw new CanteenRuleError('ORDER_STATE_CONFLICT');
      }

      const items = await this.lockOrderProducts(client, order.id);
      await this.refundCapturedOrder(client, order, items, customer.id);
      await this.changeStatus(client, order, 'CANCELLED', customer.id);

      return this.getOrder(client, order.id);
    });
  }

  async transitionOrder(input: {
    actorSubject: string;
    orderId: string;
    status: ManagementOrderStatus;
  }): Promise<CanteenOrderView> {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const order = await this.lockOrder(client, input.orderId);

      if (!order) {
        throw new CanteenRuleError('ORDER_NOT_FOUND');
      }

      if (!allowedTransitions[order.status].includes(input.status)) {
        throw new CanteenRuleError('ORDER_STATE_CONFLICT');
      }

      const items = await this.lockOrderProducts(client, order.id);

      if (input.status === 'CANCELLED_BY_CANTEEN') {
        await this.refundCapturedOrder(client, order, items, actor.id);
      }

      await this.changeStatus(client, order, input.status, actor.id);
      return this.getOrder(client, order.id);
    });
  }

  async setOrderingEnabled(input: {
    actorSubject: string;
    enabled: boolean;
  }): Promise<{ orderingEnabled: boolean }> {
    return this.postgres.withTransaction(async (client) => {
      await this.findActor(client, input.actorSubject);
      const updated = await client.query<{ ordering_enabled: boolean }>(
        `UPDATE canteen.store AS store
        SET ordering_enabled = $1,
            updated_at = now()
        FROM core.service_unit AS service
        WHERE service.id = store.service_unit_id
          AND service.code = 'canteen-main'
          AND store.customer_visible
        RETURNING store.ordering_enabled`,
        [input.enabled],
      );

      if (!updated.rows[0]) {
        throw new CanteenRuleError('MAIN_CANTEEN_NOT_FOUND');
      }

      return { orderingEnabled: updated.rows[0].ordering_enabled };
    });
  }

  private async refundCapturedOrder(
    client: PoolClient,
    order: LockedOrderRow,
    items: OrderItemRow[],
    actorId: string,
  ) {
    const total = BigInt(order.total_minor);

    for (const item of items) {
      await client.query(
        `UPDATE canteen.product
        SET stock_on_hand = stock_on_hand + $2,
            updated_at = now()
        WHERE id = $1`,
        [item.product_id, item.quantity],
      );
    }

    await client.query(
      `INSERT INTO wallet.ledger_entry (
        account_id,
        entry_type,
        available_delta_minor,
        held_delta_minor,
        idempotency_key,
        actor_user_profile_id,
        service_code,
        reference_id
      ) VALUES ($1, 'SERVICE_REFUND', $2, 0, $3, $4, 'canteen-main', $5)`,
      [
        order.account_id,
        total.toString(),
        `canteen-order-refund:${order.id}`,
        actorId,
        order.id,
      ],
    );

    await client.query(
      `UPDATE wallet.account
      SET available_minor = available_minor + $2,
          updated_at = now()
      WHERE id = $1`,
      [order.account_id, total.toString()],
    );
  }

  private async changeStatus(
    client: PoolClient,
    order: LockedOrderRow,
    status: CanteenOrderStatus,
    actorId: string,
  ) {
    await client.query(
      `UPDATE canteen.customer_order
      SET status = $2,
          updated_at = now()
      WHERE id = $1`,
      [order.id, status],
    );
    await this.recordEvent(client, order.id, order.status, status, actorId);
  }

  private recordEvent(
    client: PoolClient,
    orderId: string,
    fromStatus: CanteenOrderStatus | null,
    toStatus: CanteenOrderStatus,
    actorId: string,
  ) {
    return client.query(
      `INSERT INTO canteen.order_event (
        order_id,
        from_status,
        to_status,
        actor_user_profile_id
      ) VALUES ($1, $2, $3, $4)`,
      [orderId, fromStatus, toStatus, actorId],
    );
  }

  private async lockCustomerAccount(client: PoolClient, subject: string) {
    const result = await client.query<CustomerAccountRow>(
      `SELECT
        profile.id AS profile_id,
        account.id AS account_id,
        account.available_minor::text
      FROM core.user_profile AS profile
      JOIN wallet.account AS account ON account.user_profile_id = profile.id
      WHERE profile.keycloak_subject = $1
        AND profile.status = 'ACTIVE'
      FOR UPDATE OF account`,
      [subject],
    );

    return result.rows[0] ?? null;
  }

  private async findActor(client: PoolClient, subject: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    if (!result.rows[0]) {
      throw new CanteenRuleError('ACTOR_PROFILE_NOT_FOUND');
    }

    return result.rows[0];
  }

  private async findCustomerProfile(client: PoolClient, subject: string) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    return result.rows[0] ?? null;
  }

  private async lockMainStore(client: PoolClient) {
    const result = await client.query<StoreRow>(
      `SELECT store.id, store.ordering_enabled
      FROM canteen.store AS store
      JOIN core.service_unit AS service ON service.id = store.service_unit_id
      WHERE service.code = 'canteen-main'
        AND store.customer_visible
        AND service.active
      FOR SHARE OF store`,
    );

    return result.rows[0] ?? null;
  }

  private async lockProducts(
    client: PoolClient,
    canteenId: string,
    productIds: string[],
  ) {
    const result = await client.query<OrderProductRow>(
      `SELECT
        id,
        canteen_id,
        name,
        price_minor::text,
        stock_on_hand::text,
        stock_reserved::text,
        listed,
        archived_at
      FROM canteen.product
      WHERE canteen_id = $1
        AND id = ANY($2::uuid[])
      ORDER BY id
      FOR UPDATE`,
      [canteenId, productIds],
    );

    return result.rows;
  }

  private async lockOrder(client: PoolClient, orderId: string) {
    const orderResult = await client.query<LockedOrderBaseRow>(
      `SELECT
        orders.id,
        orders.canteen_id,
        orders.customer_user_profile_id,
        orders.status,
        orders.total_minor::text
      FROM canteen.customer_order AS orders
      WHERE orders.id = $1
      FOR UPDATE OF orders`,
      [orderId],
    );

    const order = orderResult.rows[0];

    if (!order) {
      return null;
    }

    const accountResult = await client.query<LockedAccountRow>(
      `SELECT
        id AS account_id
      FROM wallet.account
      WHERE user_profile_id = $1
      FOR UPDATE`,
      [order.customer_user_profile_id],
    );

    const account = accountResult.rows[0];

    if (!account) {
      throw new CanteenRuleError('WALLET_NOT_FOUND');
    }

    return { ...order, ...account };
  }

  private async lockOrderProducts(client: PoolClient, orderId: string) {
    const result = await client.query<OrderItemRow>(
      `SELECT item.product_id, item.quantity::text
      FROM canteen.order_item AS item
      JOIN canteen.product AS product ON product.id = item.product_id
      WHERE item.order_id = $1
      ORDER BY item.product_id
      FOR UPDATE OF product`,
      [orderId],
    );

    return result.rows;
  }

  private async listOrders(
    where: string,
    values: readonly unknown[],
  ): Promise<CanteenOrderView[]> {
    const result = await this.postgres.query<OrderRow>(
      `${this.orderSelect()}
      WHERE ${where}
      GROUP BY orders.id, profile.id
      ORDER BY
        CASE orders.status
          WHEN 'PLACED' THEN 0
          WHEN 'PREPARING' THEN 1
          WHEN 'READY' THEN 2
          ELSE 3
        END,
        orders.created_at DESC
      LIMIT 100`,
      values,
    );

    return result.rows.map(orderView);
  }

  private async getOrder(client: PoolClient, orderId: string) {
    const result = await client.query<OrderRow>(
      `${this.orderSelect()}
      WHERE orders.id = $1
      GROUP BY orders.id, profile.id`,
      [orderId],
    );

    if (!result.rows[0]) {
      throw new CanteenRuleError('ORDER_NOT_FOUND');
    }

    return orderView(result.rows[0]);
  }

  private orderSelect() {
    return `SELECT
      orders.id,
      orders.canteen_id,
      orders.customer_user_profile_id,
      orders.status,
      orders.total_minor::text,
      concat_ws(' ', profile.first_name, profile.last_name) AS customer_name,
      profile.phone_e164 AS customer_phone,
      json_agg(
        json_build_object(
          'productId', item.product_id,
          'productName', item.product_name,
          'unitPriceMinor', item.unit_price_minor::text,
          'quantity', item.quantity::text,
          'lineTotalMinor', item.line_total_minor::text
        ) ORDER BY item.product_name
      ) AS items,
      orders.created_at,
      orders.updated_at
    FROM canteen.customer_order AS orders
    JOIN core.user_profile AS profile
      ON profile.id = orders.customer_user_profile_id
    JOIN canteen.store AS store ON store.id = orders.canteen_id
    JOIN core.service_unit AS service ON service.id = store.service_unit_id
    JOIN canteen.order_item AS item ON item.order_id = orders.id`;
  }
}
