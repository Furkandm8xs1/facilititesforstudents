import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth, signOut } from '@/auth';
import { getCurrentUser, getWalletOverview } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

const services = [
  {
    title: 'Kantin',
    description: 'Ürünleri incele, sipariş ver ve teslim durumunu takip et.',
    status: 'Sipariş ver',
    active: true,
    href: '/canteen',
  },
  {
    title: 'Laundry',
    description: 'Çamaşırhane hizmetleri bu portal üzerinden yönetilecek.',
    status: 'Sonraki aşama',
    active: false,
    href: null,
  },
  {
    title: 'Kitchen',
    description: 'Mutfak hizmetleri ortak giriş ve bakiyeyi kullanacak.',
    status: 'Sonraki aşama',
    active: false,
    href: null,
  },
] as const;

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const [currentUser, wallet] = session.apiAccessToken
    ? await Promise.all([
        getCurrentUser(session.apiAccessToken),
        getWalletOverview(session.apiAccessToken),
      ])
    : [null, null];
  const displayName = currentUser?.profile
    ? `${currentUser.profile.first_name} ${currentUser.profile.last_name}`
    : (session.user.name ?? 'Yurt kullanıcısı');
  const phone =
    currentUser?.profile?.phone_e164 ??
    currentUser?.identity.preferredUsername ??
    'Profil kaydı bekleniyor';

  return (
    <main className="portal-shell">
      <nav className="account-bar" aria-label="Hesap bilgileri">
        <div>
          <strong>{displayName}</strong>
          <span>{phone}</span>
        </div>
        <div className="account-actions">
          <span className="role-count">{session.user.roles.length} yetki</span>
          {session.user.roles.includes('platform_admin') ? (
            <Link className="text-action" href="/admin/users/new">
              Kullanıcı ekle
            </Link>
          ) : null}
          {session.user.roles.includes('wallet_cashier') ? (
            <Link className="text-action" href="/wallet/cashier">
              Nakit yönetimi
            </Link>
          ) : null}
          {session.user.roles.some(
            (role) => role === 'canteen_manager' || role === 'canteen_operator',
          ) ? (
            <Link className="text-action" href="/canteen/manage">
              Kantin yönetimi
            </Link>
          ) : null}
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button className="text-action" type="submit">
              Çıkış yap
            </button>
          </form>
        </div>
      </nav>

      {session.authError ? (
        <p className="session-warning" role="alert">
          Oturum yenilenemedi. Güvenli biçimde yeniden giriş yapmalısın.
        </p>
      ) : null}

      <header className="portal-header">
        <div>
          <p className="eyebrow">Yurt içi hizmet ağı</p>
          <h1>İhtiyacın olan hizmetler tek yerde.</h1>
          <p className="intro">
            Ortak hesabın ve bakiyenle yurt hizmetlerine güvenli biçimde eriş.
          </p>
        </div>
        <Link className="balance-card" href="/wallet">
          <span>Ortak bakiye</span>
          <strong>
            {wallet ? formatTryMinor(wallet.account.availableMinor) : '—'}
          </strong>
          <small>
            {wallet
              ? `Bloke: ${formatTryMinor(wallet.account.heldMinor)} · Hareketleri gör`
              : 'Cüzdan bilgisine ulaşılamadı'}
          </small>
        </Link>
      </header>

      <section aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Servisler</p>
            <h2 id="services-title">Bugün ne yapmak istersin?</h2>
          </div>
          <span className="network-state">Yurt ağına bağlı</span>
        </div>

        <div className="service-grid">
          {services.map((service, index) => {
            const content = (
              <>
                <span className="service-number">0{index + 1}</span>
                <div>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                </div>
                <span className="service-status">{service.status}</span>
              </>
            );
            const className = `service-card ${service.active ? 'service-card-active' : ''}`;

            return service.href ? (
              <Link
                className={className}
                href={service.href}
                key={service.title}
              >
                {content}
              </Link>
            ) : (
              <article className={className} key={service.title}>
                {content}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
