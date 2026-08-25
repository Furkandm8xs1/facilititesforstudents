# Yurt Hizmet Portalı

Yurt içi ağda çalışan merkezi giriş, ortak cüzdan ve kantin uygulaması.

Ürün kapsamı ve mimari kararlar için [mimari belgesine](docs/architecture.md) bakın.
Kodun İngilizce teknik rehberleri için [uygulama dokümantasyonu dizininden](apps/README.md)
başlayın.

## Teknolojiler

- Next.js + TypeScript
- NestJS + TypeScript
- PostgreSQL
- Keycloak

## Docker ile çalıştırma

Gereksinimler:

- Docker ve Docker Compose

Kök ortam dosyasını hazırlayın:

```bash
cp .env.example .env
```

`.env` içindeki `AUTH_SECRET` değerini uzun ve rastgele bir değerle değiştirin.
Örnek parolalar ve istemci gizlisi yalnızca yerel geliştirme içindir.

PostgreSQL, Keycloak, API ve web container'larını oluşturup başlatın:

```bash
npm run docker:up
```

API container'ı başlarken bekleyen veritabanı göçlerini otomatik uygular. Servis
durumlarını `docker compose ps`, logları ise aşağıdaki komutla izleyebilirsiniz:

```bash
npm run docker:logs
```

Container'ları durdurmak için `npm run docker:down` kullanın. Bu komut
`hizmet_postgres_data` volume'unu ve verileri korur. Verileri de silmek
istemediğiniz sürece `docker compose down -v` kullanmayın.

Yerel adresler:

- Portal: `http://localhost:3000`
- API sağlık kontrolü: `http://localhost:3001/api/v1/health`
- Keycloak: `http://keycloak.localhost:8080`

## Kaynak kodu host üzerinde geliştirme

Mac üzerinde daha hızlı hot reload için yalnızca PostgreSQL ile Keycloak'ı
Docker'da, web ve API süreçlerini host üzerinde çalıştırabilirsiniz. Bunun için
Node.js 24 ve npm 11 gerekir:

```bash
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
npm install
npm run infra:up
npm run db:migrate
npm run dev
```

Bu modda Keycloak adresi `http://localhost:8080` olarak kalır. Docker ile çalışan
web ve API container'larını önce `npm run docker:down` ile durdurun; aksi halde
3000 ve 3001 portları çakışır.

Portal giriş bilgilerini Keycloak yönetir. API sağlık kontrolü herkese açıktır;
diğer API uçları geçerli bir `portal-api` erişim belirteci ister.

`platform_admin` rolündeki kullanıcılar portalın **Kullanıcı ekle** bağlantısından
telefon numarası, geçici parola ve servis rolleriyle hesap oluşturabilir. Yeni
hesap ilk girişinde parolasını değiştirmek zorundadır. API, Keycloak işlemi ile
PostgreSQL profil kaydından biri başarısız olursa yeni hesabı telafi ederek yarım
kayıt bırakmaz.

Her kullanıcı için otomatik olarak ortak bir TRY cüzdanı açılır. Kullanıcılar
portalın **Ortak bakiye** kartından kullanılabilir bakiyelerini, blokelerini ve
hareketlerini görebilir. `wallet_cashier` rolündeki görevliler **Nakit yönetimi**
ekranında telefon numarasıyla kullanıcı bulup tam TL bakiye yükleyebilir. Kasiyer
kendi hesabına yükleme yapamaz; hatalı nakit yükleme gerekçeyle, tam tutarıyla ve
yalnızca bir kez ters çevrilebilir.

Portalın **Kantin** kartı yalnızca Ana Kantin’in satışta ve stokta bulunan
ürünlerini gösterir. `canteen_manager` rolü ürün adı, tam TL fiyatı ve tam adet
stokla ürün oluşturabilir; aynı adlı ürün yeniden girildiğinde kopya açılmaz,
mevcut kayıt güncellenir. `canteen_operator` ve `canteen_manager` stok ile satış
durumunu yönetebilir ve ürünü arşivleyebilir. Fiyat ve stok değişiklikleri
değiştirilemez ürün olaylarıyla denetlenir.

Ana Kantin varsayılan olarak siparişe açıktır; yetkili görevli arayüzden geçici
olarak kapatabilir. Kullanıcı ürün ve adet seçtiğinde tutar ortak bakiyeden,
ürünler stoktan anında düşer; ayrıca görevli kabulü gerekmez. Görevli siparişi
hazırlanıyor, hazır ve teslim edildi adımlarından geçirir; teslim kodu kullanılmaz.
Kullanıcı hazırlama başlamadan iptal edebilir. Sipariş kalemindeki ürün adı ve
fiyat satış anındaki haliyle saklanır; sonraki fiyat değişiklikleri geçmiş
siparişleri ve kazancı değiştirmez.
