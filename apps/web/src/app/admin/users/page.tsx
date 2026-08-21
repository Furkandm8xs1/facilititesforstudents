import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getAdminUsers } from '@/lib/api';

import { roleOptions } from './role-options';
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
  const roleSummary = users
    ? roleOptions.map((role) => ({
        ...role,
        count: users.filter((user) => user.roles.includes(role.value)).length,
      }))
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
        <div className="users-admin-tools">
          <Link
            className="primary-action add-user-action"
            href="/admin/users/new"
          >
            Yeni kullanıcı ekle
          </Link>
          {roleSummary ? (
            <aside className="role-summary" aria-label="Rol dağılımı">
              <div className="role-summary-heading">
                <strong>Rol dağılımı</strong>
                <span>{users?.length ?? 0} kullanıcı</span>
              </div>
              <div className="role-summary-grid">
                {roleSummary.map((role) => (
                  <div className="role-summary-item" key={role.value}>
                    <strong>{role.count}</strong>
                    <span>{role.label}</span>
                  </div>
                ))}
              </div>
            </aside>
          ) : null}
        </div>
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
