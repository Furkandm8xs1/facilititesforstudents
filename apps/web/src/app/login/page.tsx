import { signIn } from '@/auth';

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card">
        <p className="eyebrow">Yurt hizmetleri</p>
        <h1>Tek hesapla tüm hizmetlere giriş yap.</h1>
        <p className="intro">
          Telefon numaran ve parolanla kantine, ortak bakiyene ve ileride
          eklenecek diğer yurt hizmetlerine erişebilirsin.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('keycloak', { redirectTo: '/' }, { prompt: 'login' });
          }}
        >
          <button className="primary-action" type="submit">
            Telefon numarasıyla giriş yap
          </button>
        </form>
        <p className="login-note">
          Hesabını yurt yöneticisi oluşturur. İlk girişinde geçici parolanı
          değiştirmen istenir.
        </p>
      </section>
    </main>
  );
}
