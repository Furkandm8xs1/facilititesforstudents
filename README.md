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

Ortam dosyasını hazırlayın ve bağımlılıkları kurun:

```bash
cp .env.example .env
npm install
```

PostgreSQL ve Keycloak'ı başlatın:

```bash
npm run infra:up
```

Web ve API uygulamalarını birlikte çalıştırın:

```bash
npm run dev
```

Yerel adresler:

- Portal: `http://localhost:3000`
- API sağlık kontrolü: `http://localhost:3001/api/v1/health`
- Keycloak: `http://localhost:8080`

`.env.example` içindeki parolalar yalnızca yerel geliştirme içindir.
