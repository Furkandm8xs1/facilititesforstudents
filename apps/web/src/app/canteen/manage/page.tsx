import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getCanteenManagement, getCanteenManagementOrders } from '@/lib/api';

import { CreateProductForm } from './create-product-form';
import { OrderQueue } from './order-queue';
import { OrderingControl } from './ordering-control';
import { ProductEditor } from './product-editor';

export default async function CanteenManagementPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const canManageDetails = session.user.roles.includes('canteen_manager');
  const canOperate = session.user.roles.includes('canteen_operator');

  if (!canManageDetails && !canOperate) {
    redirect('/');
  }

  const [catalog, orders] = await Promise.all([
    getCanteenManagement(session.apiAccessToken),
    getCanteenManagementOrders(session.apiAccessToken),
  ]);

  return (
    <main className="canteen-shell canteen-management-shell">
      <nav className="canteen-nav">
        <Link className="back-link" href="/canteen">
          ← Kantine dön
        </Link>
        <Link className="text-action" href="/">
          Portal ana sayfası
        </Link>
      </nav>

      <header className="canteen-header canteen-management-header">
        <div>
          <p className="eyebrow">Kantin yönetimi</p>
          <h1>{catalog?.canteen.name ?? 'Ana Kantin'} ürünleri</h1>
          <p className="intro">
            Ürünleri, tam TL fiyatlarını ve tam adet stoklarını yönet. Stok
            sıfıra indiğinde ürün kullanıcı kataloğundan otomatik gizlenir.
          </p>
        </div>
      </header>

      {catalog ? (
        <OrderingControl enabled={catalog.canteen.orderingEnabled} />
      ) : null}

      <section aria-labelledby="order-queue-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Canlı operasyon</p>
            <h2 id="order-queue-title">Sipariş kuyruğu</h2>
          </div>
          <span className="network-state">{orders.length} sipariş</span>
        </div>

        {orders.length === 0 ? (
          <p className="empty-state">Henüz sipariş bulunmuyor.</p>
        ) : (
          <div className="management-order-list">
            {orders.map((order) => (
              <OrderQueue key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      {canManageDetails ? (
        <section
          className="product-create-section"
          aria-labelledby="new-product-title"
        >
          <div>
            <p className="eyebrow">Yeni veya mevcut ürün</p>
            <h2 id="new-product-title">Kataloğa ürün kaydet</h2>
            <p>
              Aynı adlı ürün varsa yeni kopya açılmaz; fiyatı, stoğu ve satış
              durumu güncellenir.
            </p>
          </div>
          <CreateProductForm />
        </section>
      ) : null}

      <section aria-labelledby="managed-products-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Katalog ve stok</p>
            <h2 id="managed-products-title">Tüm ürünler</h2>
          </div>
          <span className="network-state">
            {catalog?.products.length ?? 0} ürün
          </span>
        </div>

        {!catalog ? (
          <p className="empty-state" role="alert">
            Kantin yönetim bilgilerine ulaşılamadı.
          </p>
        ) : catalog.products.length === 0 ? (
          <p className="empty-state">Henüz bir ürün kaydedilmedi.</p>
        ) : (
          <div className="product-editor-list">
            {catalog.products.map((product) => (
              <ProductEditor
                product={product}
                canManageDetails={canManageDetails}
                key={product.id}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
