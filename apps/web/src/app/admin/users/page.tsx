import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getAdminUsers } from '@/lib/api';

import { UserRoleEditor } from './user-role-editor';

export default async function UsersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  if (!session.user.roles.includes('platform_admin')) {
    redirect('/');
  }

  const users = session.apiAccessToken
    ? await getAdminUsers(session.apiAccessToken)
    : null;

  return (
    <main className="admin-shell users-admin-shell">
      <Link className="back-link" href="/">
        ← Portala dön
      </Link>
      <header className="admin-header users-admin-header">
        <div>
          <p className="eyebrow">Kullanıcı yönetimi</p>
          <h1>Kullanıcılar</h1>
          <p className="intro">
            İlk şifre değişimini tamamlamış portal kullanıcılarını görüntüle.
            Rollerini görmek ve düzenlemek için kullanıcı satırına tıkla.
          </p>
        </div>
        <Link
          className="primary-action add-user-action"
          href="/admin/users/new"
        >
          Yeni kullanıcı ekle
        </Link>
      </header>

      {users === null ? (
        <p className="empty-state">
          Kullanıcı listesine ulaşılamadı. API ve Keycloak hizmetlerini kontrol
          edip tekrar deneyin.
        </p>
      ) : users.length === 0 ? (
        <p className="empty-state">
          İlk şifre değişimini tamamlamış kullanıcı bulunmuyor.
        </p>
      ) : (
        <section className="user-table" aria-label="Portal kullanıcıları">
          <div className="user-table-grid">
            <div className="user-table-header" aria-hidden="true">
              <span>Sıra</span>
              <span>Ad soyad</span>
              <span>Telefon</span>
              <span>Durum</span>
              <span>Roller</span>
              <span />
            </div>
            {users.map((user, index) => (
              <UserRoleEditor
                currentUserSubject={session.user.id}
                key={user.id}
                rowNumber={index + 1}
                user={user}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
