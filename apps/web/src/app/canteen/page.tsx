import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getCanteenCatalog } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

export default async function CanteenPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const catalog = await getCanteenCatalog(session.apiAccessToken);
  const canManage = session.user.roles.some(
    (role) => role === 'canteen_manager' || role === 'canteen_operator',
  );

  return (
    <main className="canteen-shell">
      <nav className="canteen-nav">
        <Link className="back-link" href="/">
          ← Portala dön
        </Link>
        {canManage ? (
          <Link className="text-action" href="/canteen/manage">
            Ürün yönetimi
          </Link>
        ) : null}
      </nav>

      <header className="canteen-header">
        <div>
          <p className="eyebrow">Yurt kantini</p>
          <h1>{catalog?.canteen.name ?? 'Ana Kantin'}</h1>
          <p className="intro">
            Satışta ve stokta bulunan ürünleri burada görebilirsin. Sipariş
            verme akışı bir sonraki aşamada etkinleşecek.
          </p>
        </div>
        <div className="canteen-state-card">
          <span>Sipariş durumu</span>
          <strong>
            {catalog?.canteen.orderingEnabled ? 'Siparişe açık' : 'Kapalı'}
          </strong>
          <small>Ürün kataloğu görüntülenebilir</small>
        </div>
      </header>

      <section aria-labelledby="canteen-products-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Güncel katalog</p>
            <h2 id="canteen-products-title">Satıştaki ürünler</h2>
          </div>
          <span className="network-state">
            {catalog?.products.length ?? 0} ürün
          </span>
        </div>

        {!catalog ? (
          <p className="empty-state" role="alert">
            Kantin kataloğuna ulaşılamadı. Lütfen tekrar deneyin.
          </p>
        ) : catalog.products.length === 0 ? (
          <p className="empty-state">
            Şu anda satışta ve stokta ürün bulunmuyor.
          </p>
        ) : (
          <div className="catalog-grid">
            {catalog.products.map((product) => (
              <article className="catalog-card" key={product.id}>
                <span className="catalog-stock">
                  {product.availableStock} adet kaldı
                </span>
                <div>
                  <h3>{product.name}</h3>
                  <strong>{formatTryMinor(product.priceMinor)}</strong>
                </div>
                <small>Sipariş yakında</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
