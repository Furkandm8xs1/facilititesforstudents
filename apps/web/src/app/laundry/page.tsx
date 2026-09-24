import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getLaundryOverview } from '@/lib/api';

import { LaundryAutoRefresh } from './auto-refresh';
import { LaundryLoadCard } from './load-card';

export default async function LaundryPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const overview = await getLaundryOverview(session.apiAccessToken);
  const canManage = session.user.roles.some(
    (role) => role === 'laundry_operator' || role === 'laundry_manager',
  );

  return (
    <main className="laundry-shell">
      <LaundryAutoRefresh />
      <nav className="laundry-nav">
        <Link className="back-link" href="/">
          ← Portala dön
        </Link>
        {canManage ? (
          <Link className="text-action" href="/laundry/manage">
            Laundry yönetimi
          </Link>
        ) : null}
      </nav>

      <header className="laundry-header">
        <div>
          <p className="eyebrow">Çamaşırhane</p>
          <h1>Laundry durumun</h1>
          <p className="intro">
            Makinedeki ve tamamlanan işlemlerini, zamanlarını ve ücretlerini
            takip et. Bu ekran 20 saniyede bir yenilenir.
          </p>
        </div>
        <div className="laundry-state-card">
          <span>Şu anda</span>
          <strong>{overview?.activeLoads.length ?? 0} aktif yük</strong>
          <small>İşlemler görevli tarafından yönetilir.</small>
        </div>
      </header>

      {!overview ? (
        <p className="empty-state" role="alert">
          Laundry bilgilerine ulaşılamadı. Lütfen tekrar deneyin.
        </p>
      ) : (
        <>
          <section aria-labelledby="active-laundry-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Canlı durum</p>
                <h2 id="active-laundry-title">Aktif işlemler</h2>
              </div>
              <span className="network-state">
                {overview.activeLoads.length} aktif
              </span>
            </div>
            {overview.activeLoads.length ? (
              <div className="laundry-load-list">
                {overview.activeLoads.map((load) => (
                  <LaundryLoadCard load={load} key={load.id} />
                ))}
              </div>
            ) : (
              <p className="empty-state">Şu anda aktif Laundry işlemin yok.</p>
            )}
          </section>

          <section aria-labelledby="laundry-history-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Geçmiş</p>
                <h2 id="laundry-history-title">Önceki işlemler</h2>
              </div>
              <span className="network-state">
                {overview.history.length} kayıt
              </span>
            </div>
            {overview.history.length ? (
              <div className="laundry-load-list">
                {overview.history.map((load) => (
                  <LaundryLoadCard load={load} key={load.id} />
                ))}
              </div>
            ) : (
              <p className="empty-state">Henüz tamamlanan bir işlem yok.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
