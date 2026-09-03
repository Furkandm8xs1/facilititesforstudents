import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getTeaCafeOverview } from '@/lib/api';

import { BrewList } from './brew-list';

export default async function TeaCafePage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const overview = await getTeaCafeOverview(session.apiAccessToken);
  const brews = overview?.brews ?? null;
  const initialNow = overview
    ? new Date(overview.serverTime).getTime()
    : new Date(0).getTime();
  const brewingCount =
    brews?.filter((brew) => new Date(brew.readyAt).getTime() > initialNow)
      .length ?? 0;
  const canManage = session.user.roles.includes('tea_cafe_attendant');

  return (
    <main className="tea-cafe-shell">
      <nav className="tea-cafe-nav">
        <Link className="back-link" href="/">
          ← Portala dön
        </Link>
        {canManage ? (
          <Link className="text-action" href="/tea-cafe/manage">
            Demlemeleri yönet
          </Link>
        ) : null}
      </nav>

      <header className="tea-cafe-header">
        <div>
          <p className="eyebrow">Çayhane servisi</p>
          <h1>Tea &amp; Cafe</h1>
          <p className="intro">
            Çayın ve kahvenin ne zaman hazır olacağını canlı sayaçtan takip et.
            Sayfa yeni demlemeler için kendini otomatik yeniler.
          </p>
        </div>
        <div className="tea-cafe-state-card">
          <span>Şu anda</span>
          <strong>{brewingCount} demleme sürüyor</strong>
          <small>Çay her zaman 21 dakikada hazır olur.</small>
        </div>
      </header>

      <section aria-labelledby="current-brews-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Canlı durum</p>
            <h2 id="current-brews-title">Güncel demlemeler</h2>
          </div>
          <span className="network-state">{brews?.length ?? 0} kayıt</span>
        </div>

        {brews === null ? (
          <p className="empty-state" role="alert">
            Tea &amp; Cafe bilgilerine ulaşılamadı. Lütfen tekrar deneyin.
          </p>
        ) : (
          <BrewList brews={brews} initialNow={initialNow} />
        )}
      </section>
    </main>
  );
}
