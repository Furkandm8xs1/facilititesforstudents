import Form from 'next/form';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import {
  getCashierWallet,
  getCurrentUser,
  searchCashierWallets,
} from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { CashDepositForm } from './cash-deposit-form';
import { ReverseDepositForm } from './reverse-deposit-form';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export default async function CashierWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string | string[] }>;
}) {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  if (!session.user.roles.includes('wallet_cashier')) {
    redirect('/');
  }

  const rawPhone = (await searchParams).phone;
  const phone =
    typeof rawPhone === 'string' ? rawPhone.replaceAll(' ', '') : '';
  const [accounts, currentUser] = await Promise.all([
    searchCashierWallets(session.apiAccessToken, phone),
    getCurrentUser(session.apiAccessToken),
  ]);
  const selectedAccount =
    accounts.find((account) => account.phoneE164 === phone) ??
    (accounts.length === 1 ? accounts[0] : null);
  const wallet = selectedAccount
    ? await getCashierWallet(session.apiAccessToken, selectedAccount.accountId)
    : null;
  const isOwnWallet =
    wallet?.account.userProfileId === currentUser?.profile?.id;
  const cashEntries =
    wallet?.entries.filter(
      (entry) =>
        entry.entryType === 'CASH_DEPOSIT' ||
        entry.entryType === 'CASH_DEPOSIT_REVERSAL',
    ) ?? [];

  return (
    <main className="wallet-shell cashier-shell">
      <Link className="back-link" href="/">
        ← Portala dön
      </Link>
      <header className="wallet-header wallet-header-compact">
        <div>
          <p className="eyebrow">Cüzdan kasası</p>
          <h1>Nakit bakiyeyi güvenle kaydet.</h1>
          <p className="intro">
            Kullanıcıyı telefonuyla bul. Yükleme anında ortak bakiyesine yansır;
            hatalı yüklemeler gerekçeyle tam olarak geri alınır.
          </p>
        </div>
      </header>

      <section
        className="cashier-search"
        aria-labelledby="cashier-search-title"
      >
        <div>
          <p className="eyebrow">Kullanıcı bul</p>
          <h2 id="cashier-search-title">Telefon numarasıyla ara</h2>
        </div>
        <Form action="/wallet/cashier" className="search-form">
          <input
            name="phone"
            type="tel"
            defaultValue={phone}
            placeholder="+905551112233"
            autoComplete="off"
            required
          />
          <button className="primary-action">Cüzdanı getir</button>
        </Form>
      </section>

      {phone && accounts.length === 0 ? (
        <p className="empty-state" role="status">
          Bu telefon numarasıyla bir kullanıcı bulunamadı.
        </p>
      ) : null}

      {accounts.length > 1 && !selectedAccount ? (
        <div className="wallet-search-results">
          {accounts.map((account) => (
            <Link
              href={`/wallet/cashier?phone=${encodeURIComponent(account.phoneE164)}`}
              key={account.accountId}
            >
              <strong>
                {account.firstName} {account.lastName}
              </strong>
              <span>{account.phoneE164}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {wallet ? (
        <section
          className="cashier-account"
          aria-labelledby="cashier-account-title"
        >
          <header>
            <div>
              <p className="eyebrow">Seçili cüzdan</p>
              <h2 id="cashier-account-title">
                {wallet.account.firstName} {wallet.account.lastName}
              </h2>
              <span>{wallet.account.phoneE164}</span>
            </div>
            <div className="cashier-balance">
              <span>Kullanılabilir</span>
              <strong>{formatTryMinor(wallet.account.availableMinor)}</strong>
              <small>Bloke: {formatTryMinor(wallet.account.heldMinor)}</small>
            </div>
          </header>

          {isOwnWallet ? (
            <p className="session-warning">
              Kendi cüzdanına bakiye yükleyemezsin. İşlemi başka bir cüzdan
              kasiyeri yapmalıdır.
            </p>
          ) : wallet.account.status !== 'ACTIVE' ? (
            <p className="session-warning">
              Bu kullanıcı aktif olmadığı için bakiye yüklenemez.
            </p>
          ) : (
            <CashDepositForm phoneE164={wallet.account.phoneE164} />
          )}

          <div className="cash-history">
            <h3>Nakit hareketleri</h3>
            {cashEntries.length === 0 ? (
              <p className="empty-state">Henüz nakit hareketi bulunmuyor.</p>
            ) : (
              cashEntries.map((entry) => {
                const canReverse =
                  entry.entryType === 'CASH_DEPOSIT' &&
                  !entry.reversed &&
                  BigInt(wallet.account.availableMinor) >=
                    BigInt(entry.availableDeltaMinor);

                return (
                  <article className="cash-entry" key={entry.id}>
                    <div className="cash-entry-summary">
                      <div>
                        <strong>
                          {entry.entryType === 'CASH_DEPOSIT'
                            ? 'Nakit yükleme'
                            : 'Ters kayıt'}
                        </strong>
                        <span>
                          {dateFormatter.format(new Date(entry.createdAt))}
                          {entry.actorName ? ` · ${entry.actorName}` : ''}
                        </span>
                        {entry.reason ? <small>{entry.reason}</small> : null}
                      </div>
                      <div className="ledger-amount">
                        <strong>
                          {formatTryMinor(entry.availableDeltaMinor, true)}
                        </strong>
                        {entry.reversed ? <span>Ters çevrildi</span> : null}
                      </div>
                    </div>
                    {canReverse ? (
                      <details>
                        <summary>Hatalı yüklemeyi düzelt</summary>
                        <ReverseDepositForm entryId={entry.id} />
                      </details>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
