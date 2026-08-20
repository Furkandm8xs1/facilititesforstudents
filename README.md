# Yurt Hizmet Portalı

Yurt içi ağda çalışan merkezi giriş, ortak cüzdan ve kantin uygulaması.

Ürün kapsamı ve mimari kararlar için [mimari belgesine](docs/architecture.md) bakın.

## Teknolojiler

- Next.js + TypeScript
- NestJS + TypeScript
- PostgreSQL
- Keycloak

## Yerel geliştirme

Gereksinimler:

- Node.js 24
- npm 11
- Docker ve Docker Compose

Ortam dosyalarını hazırlayın ve bağımlılıkları kurun:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
npm install
```

`apps/web/.env.local` içindeki `AUTH_SECRET` değerini uzun ve rastgele bir
değerle değiştirin. Örnek parolalar ve istemci gizlisi yalnızca yerel geliştirme
içindir.

PostgreSQL ve Keycloak'ı başlatın:

```bash
npm run infra:up
npm run db:migrate
```

Web ve API uygulamalarını birlikte çalıştırın:

```bash
npm run dev
```

Yerel adresler:

- Portal: `http://localhost:3000`
- API sağlık kontrolü: `http://localhost:3001/api/v1/health`
- Keycloak: `http://localhost:8080`

Portal giriş bilgilerini Keycloak yönetir. API sağlık kontrolü herkese açıktır;
diğer API uçları geçerli bir `portal-api` erişim belirteci ister.
