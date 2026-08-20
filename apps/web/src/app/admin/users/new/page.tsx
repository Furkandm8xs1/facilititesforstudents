import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { CreateUserForm } from './create-user-form';

export default async function NewUserPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  if (!session.user.roles.includes('platform_admin')) {
    redirect('/');
  }

  return (
    <main className="admin-shell">
      <Link className="back-link" href="/">
        ← Portala dön
      </Link>
      <header className="admin-header">
        <div>
          <p className="eyebrow">Kullanıcı yönetimi</p>
          <h1>Yeni hesap oluştur</h1>
          <p className="intro">
            Kullanıcı telefon numarası ve geçici parolayla giriş yapacak.
            Seçtiğin roller tüm portal servislerinde geçerli olacak.
          </p>
        </div>
      </header>
      <CreateUserForm />
    </main>
  );
}
