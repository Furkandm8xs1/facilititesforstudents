import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getWalletOverview, type WalletEntryType } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

const entryLabels: Record<WalletEntryType, string> = {
  CASH_DEPOSIT: 'Nakit bakiye yüklendi',
  CASH_DEPOSIT_REVERSAL: 'Nakit yükleme düzeltildi',
  HOLD: 'Hizmet tutarı bloke edildi',
  CAPTURE: 'Hizmet ödemesi tamamlandı',
  RELEASE: 'Bloke kaldırıldı',
  SERVICE_REFUND: 'Hizmet iadesi yapıldı',
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export default async function WalletPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const wallet = await getWalletOverview(session.apiAccessToken);

  return (
    <main className="wallet-shell">
      <Link className="back-link" href="/">
        ← Portala dön
      </Link>

      <header className="wallet-header">
        <div>
          <p className="eyebrow">Ortak cüzdan</p>
          <h1>Bakiyen bütün hizmetlerde geçerli.</h1>
          <p className="intro">
            Nakit yüklemelerini, blokeleri ve hizmet hareketlerini tek yerde
            takip et.
          </p>
        </div>
        {wallet ? (
          <div className="wallet-balance-card">
            <span>Kullanılabilir bakiye</span>
            <strong>{formatTryMinor(wallet.account.availableMinor)}</strong>
            <small>
              Bloke: {formatTryMinor(wallet.account.heldMinor)} · TRY
            </small>
          </div>
        ) : null}
      </header>

      {!wallet ? (
        <p className="empty-state" role="alert">
          Cüzdan bilgilerine ulaşılamadı. Lütfen yeniden giriş yapıp tekrar
          deneyin.
        </p>
      ) : (
        <section className="ledger-section" aria-labelledby="ledger-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Hareket defteri</p>
              <h2 id="ledger-title">Son işlemler</h2>
            </div>
            <span className="network-state">
              {wallet.entries.length} hareket
            </span>
          </div>

          {wallet.entries.length === 0 ? (
            <p className="empty-state">
              Henüz bir cüzdan hareketin bulunmuyor.
            </p>
          ) : (
            <div className="ledger-list">
              {wallet.entries.map((entry) => {
                const displayDelta =
                  entry.availableDeltaMinor !== '0'
                    ? entry.availableDeltaMinor
                    : entry.heldDeltaMinor;

                return (
                  <article className="ledger-row" key={entry.id}>
                    <div>
                      <strong>{entryLabels[entry.entryType]}</strong>
                      <span>
                        {dateFormatter.format(new Date(entry.createdAt))}
                        {entry.actorName ? ` · ${entry.actorName}` : ''}
                      </span>
                      {entry.reason ? <small>{entry.reason}</small> : null}
                    </div>
                    <div className="ledger-amount">
                      <strong>{formatTryMinor(displayDelta, true)}</strong>
                      {entry.reversed ? <span>Ters çevrildi</span> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
