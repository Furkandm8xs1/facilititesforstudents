import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getTeaCafeOverview } from '@/lib/api';

import { BrewList } from '../brew-list';
import { BrewForm } from './brew-form';

export default async function TeaCafeManagementPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  if (!session.user.roles.includes('tea_cafe_attendant')) {
    redirect('/tea-cafe');
  }

  const overview = await getTeaCafeOverview(session.apiAccessToken);
  const brews = overview?.brews ?? null;
  const initialNow = overview
    ? new Date(overview.serverTime).getTime()
    : new Date(0).getTime();

  return (
    <main className="tea-cafe-shell tea-cafe-management-shell">
      <nav className="tea-cafe-nav">
        <Link className="back-link" href="/tea-cafe">
          ← Tea &amp; Cafe’ye dön
        </Link>
        <Link className="text-action" href="/">
          Portal ana sayfası
        </Link>
      </nav>

      <header className="tea-cafe-management-header">
        <p className="eyebrow">Çayhane görevlisi</p>
        <h1>Demlemeleri yönet</h1>
        <p className="intro">
          Her yeni demlik veya kahve için ayrı kayıt açabilirsin. Çayın hazır
          olacağı saat otomatik hesaplanır; kahvenin süresini sen belirlersin.
        </p>
      </header>

      <section className="brew-create-section" aria-labelledby="new-brew-title">
        <div>
          <p className="eyebrow">Yeni kayıt</p>
          <h2 id="new-brew-title">Ne demledin?</h2>
          <p>
            Aynı anda birden fazla kayıt açık kalabilir. Gerekirse kısa bir not
            ekleyerek demlikleri birbirinden ayır.
          </p>
        </div>
        <BrewForm />
      </section>

      <section aria-labelledby="managed-brews-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Aktif liste</p>
            <h2 id="managed-brews-title">Demleme kayıtları</h2>
          </div>
          <span className="network-state">{brews?.length ?? 0} kayıt</span>
        </div>

        {brews === null ? (
          <p className="empty-state" role="alert">
            Demleme kayıtlarına ulaşılamadı. Lütfen tekrar deneyin.
          </p>
        ) : (
          <BrewList brews={brews} initialNow={initialNow} canDelete />
        )}
      </section>
    </main>
  );
}
