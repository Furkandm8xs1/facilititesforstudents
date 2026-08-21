# API Authentication ve Authorization Rehberi

Bu klasördeki kodlar API'ye gelen isteğin kim tarafından gönderildiğini ve bu
kullanıcının istenen işlemi yapmaya yetkisi olup olmadığını kontrol eder.

Bu iki kavramı ayırmak önemlidir:

- **Authentication (kimlik doğrulama):** "Bu isteği gönderen kullanıcı gerçekten
  kim?" sorusunun cevabıdır. Bu projede cevap, Keycloak tarafından imzalanmış
  JWT access token içinden alınır.
- **Authorization (yetkilendirme):** "Kimliği doğrulanan kullanıcı bu işlemi
  yapabilir mi?" sorusunun cevabıdır. Bu projede cevap, kullanıcının rolleri ile
  endpoint'in istediği roller karşılaştırılarak bulunur.

Kısaca akış şöyledir:

```text
HTTP isteği
   -> Authorization: Bearer <JWT> header'ını al
   -> JWT'yi Keycloak public key'i ile doğrula
   -> JWT claim'lerini AuthUser nesnesine dönüştür
   -> AuthUser nesnesini request.user içine koy
   -> Endpoint'in rol kurallarını kullanıcının rolleriyle karşılaştır
   -> İzin varsa controller'ı çalıştır
```

Guard'lar global kaydedildiği için yeni endpoint'ler varsayılan olarak
korumalıdır. Bir endpoint'in token olmadan çalışması özellikle `@Public()` ile
belirtilmelidir.

## 1. İstek sisteme geldiğinde ne olur?

Örnek bir istemci isteği:

```http
GET /api/v1/canteen/orders
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

Burada `Bearer`, header'daki değerin bir access token olduğunu belirtir.
`Bearer ` ifadesinden sonraki uzun metin JWT'dir. İstek önce NestJS global
guard'larından geçer:

```text
JwtAuthGuard
   -> token var mı ve geçerli mi?

RolesGuard
   -> kullanıcının gerekli rolü var mı?

CanteenController
   -> asıl iş mantığını başlatır
```

Kimlik doğrulama başarısızsa controller'a hiç ulaşılmaz. Kimlik doğrulama
başarılı ama rol kontrolü başarısızsa yine controller çalışmaz.

## 2. Dosyaların görevleri

| Dosya                                                            | Görevi                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`auth.module.ts`](./auth.module.ts)                             | Servis ve global guard'ları NestJS'e kaydeder.                                  |
| [`keycloak-jwt.service.ts`](./keycloak-jwt.service.ts)           | JWT imzasını ve claim'lerini doğrular; claim'leri `AuthUser` nesnesine çevirir. |
| [`jwt-auth.guard.ts`](./jwt-auth.guard.ts)                       | Bearer token'ı ister, doğrulatır ve sonucu `request.user` içine koyar.          |
| [`roles.guard.ts`](./roles.guard.ts)                             | Endpoint'in rol kurallarını kullanıcının rolleriyle karşılaştırır.              |
| [`roles.decorator.ts`](./roles.decorator.ts)                     | Endpoint'lere rol kuralları ekleyen decorator'ları tanımlar.                    |
| [`public.decorator.ts`](./public.decorator.ts)                   | Endpoint'i authentication kontrolünden muaf tutar.                              |
| [`auth-user.ts`](./auth-user.ts)                                 | Doğrulanmış kullanıcının uygulama içindeki tipini tanımlar.                     |
| [`authenticated-request.ts`](./authenticated-request.ts)         | `request.headers` ve doğrulama sonrası `request.user` alanlarını tiplendirir.   |
| [`keycloak-jwt.service.spec.ts`](./keycloak-jwt.service.spec.ts) | Keycloak claim'lerinin doğru `AuthUser` nesnesine çevrildiğini test eder.       |
| [`roles.guard.spec.ts`](./roles.guard.spec.ts)                   | Rol koşullarının kabul ve ret durumlarını test eder.                            |

## 3. `auth.module.ts`: sistemi global olarak kurmak

```ts
@Module({
  providers: [
    KeycloakJwtService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
```

`@Module`, NestJS'e bu modülün hangi provider'lara sahip olduğunu söyler.

```ts
KeycloakJwtService,
```

Bu servis dependency injection sistemiyle oluşturulur ve `JwtAuthGuard` içine
verilir.

```ts
{ provide: APP_GUARD, useClass: JwtAuthGuard },
```

`APP_GUARD`, guard'ı global yapar. Bu nedenle her controller'a tek tek
`@UseGuards(JwtAuthGuard)` yazmak gerekmez.

```ts
{ provide: APP_GUARD, useClass: RolesGuard },
```

Bu da rol guard'ını global yapar. Ancak bir endpoint'te rol metadata'sı yoksa
`RolesGuard` o endpoint için ek bir rol kısıtlaması uygulamaz.

Sonuç olarak bütün endpoint'lerde varsayılan beklenti şudur:

```text
JWT gerekli.
Özel rol metadata'sı yoksa herhangi bir doğrulanmış kullanıcı yeterli.
Rol metadata'sı varsa ilgili rol koşulu da sağlanmalı.
```

## 4. `AuthUser`: token bilgisinin uygulama içindeki şekli

```ts
export interface AuthUser {
  subject: string;
  preferredUsername?: string;
  realmRoles: string[];
  clientRoles: string[];
}
```

Bu interface JWT'nin ham yapısını değil, uygulamanın ihtiyaç duyduğu
normalleştirilmiş kullanıcı yapısını temsil eder.

| Alan                | Kaynak claim                          | Anlamı                                                        |
| ------------------- | ------------------------------------- | ------------------------------------------------------------- |
| `subject`           | `sub`                                 | Kullanıcının Keycloak'taki benzersiz kimliği.                 |
| `preferredUsername` | `preferred_username`                  | Keycloak kullanıcı adı; bu projede telefon numarası olabilir. |
| `realmRoles`        | `realm_access.roles`                  | Realm genelindeki roller.                                     |
| `clientRoles`       | `resource_access['portal-api'].roles` | `portal-api` client'ına ait roller.                           |

Örneğin uygulama içinde kullanılacak kullanıcı şöyledir:

```ts
{
   subject: '6d4b0b68-020a-48ba-ad50-54f7da55b04f',
   preferredUsername: '+905551112233',
   realmRoles: ['portal_user'],
   clientRoles: ['canteen_operator', 'wallet_cashier'],
}
```

Controller'lar bu sade yapıyı kullanır. Böylece her controller'ın Keycloak'ın
`resource_access` gibi ayrıntılı JWT yapısını bilmesi gerekmez.

## 5. `AuthenticatedRequest`: kullanıcı request'e nasıl eklenir?

```ts
export interface AuthenticatedRequest {
  headers: {
    authorization?: string;
    [header: string]: string | string[] | undefined;
  };
  user: AuthUser;
}
```

İstek geldiğinde header şu alandan okunur:

```ts
request.headers.authorization;
```

JWT başarıyla doğrulandıktan sonra `JwtAuthGuard` şu atamayı yapar:

```ts
request.user = await this.keycloakJwt.verify(token);
```

Bu atamadan sonra sonraki kodlar kullanıcıya şu şekilde erişebilir:

```ts
const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
const userId = request.user.subject;
const roles = request.user.clientRoles;
```

`request.user` istemcinin body içinde gönderdiği bir alan değildir. Sunucu,
Keycloak tarafından doğrulanmış token'dan kendisi üretir. Bu nedenle kullanıcı
kimliği için body'den gelen `subject` veya `userId` değerine güvenilmemelidir.

## 6. `public.decorator.ts`: hangi endpoint'ler herkese açık?

```ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`@Public()` çağrıldığında endpoint üzerine `isPublic: true` metadata'sı yazılır.
Örneğin:

```ts
@Public()
@Get('health')
health() {
   return { status: 'ok' };
}
```

Bu endpoint'te token aranmaz. Health check'ler genellikle load balancer,
container platformu veya Kubernetes tarafından token gönderilmeden çağrıldığı
için public yapılır.

`@Public()` authentication'ı bypass eder; rol kontrolü için kullanılacak bir
rol vermez. Public endpoint'lerde `request.user` bulunmayacağı varsayılmalıdır.

## 7. `jwt-auth.guard.ts`: token kontrolünün tamamı

### Guard'ın tanımı

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
```

`CanActivate`, NestJS'e bu sınıfın bir isteğin devam edip edemeyeceğine karar
verdiğini söyler. Karar `canActivate` metodunda verilir.

### Public kontrolü

```ts
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  context.getHandler(),
  context.getClass(),
]);

if (isPublic) {
  return true;
}
```

`Reflector`, decorator'ların eklediği metadata'yı okur. Önce çağrılan method'a,
sonra controller sınıfına bakılır. `@Public()` bulunursa `true` döner ve token
kontrolü atlanır.

### Header'ı alma ve Bearer formatını kontrol etme

```ts
const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
const authorization = request.headers.authorization;

if (!authorization?.startsWith('Bearer ')) {
  throw new UnauthorizedException('Geçerli bir erişim belirteci gerekli.');
}
```

Beklenen header formatı şöyledir:

```http
Authorization: Bearer <token>
```

`authorization?.startsWith('Bearer ')` ifadesi iki şeyi kontrol eder:

1. `authorization` var mı?
2. Değer `Bearer ` ile başlıyor mu?

Header yoksa, boşsa veya `Basic` gibi farklı bir authentication şeması
kullanıyorsa `UnauthorizedException` atılır. NestJS bunu HTTP `401
Unauthorized` cevabına dönüştürür.

### `Bearer ` kısmını ayırma ve kullanıcıyı request'e yazma

```ts
request.user = await this.keycloakJwt.verify(authorization.slice(7));
return true;
```

`Bearer ` tam olarak 7 karakter olduğu için `slice(7)` bu prefix'i çıkarır.

```ts
'Bearer eyJhbGciOiJSUzI1NiIs...'.slice(7);
// 'eyJhbGciOiJSUzI1NiIs...'
```

Çıkan yalnızca JWT, `KeycloakJwtService.verify` metoduna gönderilir. Doğrulama
başarılıysa dönen `AuthUser` request'e yazılır ve `true` dönülür.

### Hataları yakalama

```ts
try {
  request.user = await this.keycloakJwt.verify(authorization.slice(7));
  return true;
} catch (error) {
  this.logger.warn(
    `Erişim belirteci doğrulanamadı: ${
      error instanceof Error ? error.message : 'bilinmeyen hata'
    }`,
  );
  throw new UnauthorizedException('Erişim belirteci doğrulanamadı.');
}
```

Token süresi dolmuş, imzası hatalı, issuer'ı yanlış veya audience'ı farklı
olabilir. Ayrıca token içinde zorunlu `sub` alanı bulunmayabilir. Bu hatalar
log'a yazılır; istemciye ise genel bir `401` mesajı gönderilir.

## 8. `keycloak-jwt.service.ts`: JWT nasıl doğrulanır?

### Yapılandırmayı okuma

```ts
constructor(config: ConfigService) {
   this.issuer = config.get<string>('KEYCLOAK_ISSUER') ?? '';
   this.audience = config.get<string>('KEYCLOAK_AUDIENCE') ?? '';

   if (!this.issuer || !this.audience) {
      throw new Error('KEYCLOAK_ISSUER ve KEYCLOAK_AUDIENCE tanımlanmalıdır.');
   }
}
```

Bu değerler environment/config dosyasından gelir. Örnek:

```env
KEYCLOAK_ISSUER=http://localhost:8080/realms/hizmet
KEYCLOAK_AUDIENCE=portal-api
```

`issuer`, token'ı üreten Keycloak realm'idir. `audience`, token'ın hangi client
veya servis için üretildiğini belirtir. Bu API yalnızca beklenen issuer ve
audience değerlerine sahip token'ları kabul eder.

Değerlerden biri eksikse servis oluşturulurken hata atılır. Böylece API yanlış
authentication ayarlarıyla çalışmaya devam etmez.

### Keycloak public key'lerini hazırlama

```ts
this.jwks ??= createRemoteJWKSet(
  new URL(`${this.issuer}/protocol/openid-connect/certs`),
);
```

Keycloak token'ı private key ile imzalar. API bu imzayı kontrol etmek için
Keycloak'ın public key'lerine ihtiyaç duyar. Public key endpoint'i şuna benzer:

```text
http://localhost:8080/realms/hizmet/protocol/openid-connect/certs
```

`createRemoteJWKSet` bu endpoint'i kullanır. `??=` sayesinde JWKS nesnesi ilk
doğrulamada oluşturulur, sonraki isteklerde aynı nesne tekrar kullanılır.

### Token'ı doğrulama

```ts
const { payload } = await jwtVerify(accessToken, this.jwks, {
  issuer: this.issuer,
  audience: this.audience,
  algorithms: ['RS256'],
});
```

`jwtVerify` aşağıdaki kontrolleri yapar:

| Kontrol            | Ne anlama gelir?                                                 |
| ------------------ | ---------------------------------------------------------------- |
| İmza               | Token gerçekten Keycloak'ın private key'i ile imzalanmış mı?     |
| `issuer`           | Token beklenen Keycloak realm'inden mi geliyor?                  |
| `audience`         | Token bu API/client için mi üretilmiş?                           |
| `algorithms`       | Token yalnızca izin verilen `RS256` algoritmasını mı kullanıyor? |
| JWT zaman alanları | Token henüz geçerli mi ve süresi dolmuş mu?                      |

Bu kontrollerden biri başarısızsa `jwtVerify` hata atar ve `JwtAuthGuard` bunu
`401 Unauthorized` cevabına çevirir.

## 9. `authUserFromClaims`: JWT'den kullanıcı nesnesine geçiş

Keycloak'tan gelen ham payload örneği:

```json
{
  "sub": "6d4b0b68-020a-48ba-ad50-54f7da55b04f",
  "preferred_username": "+905551112233",
  "realm_access": {
    "roles": ["portal_user"]
  },
  "resource_access": {
    "portal-api": {
      "roles": ["canteen_operator", "wallet_cashier"]
    }
  }
}
```

Kod bu payload'ı şu forma çevirir:

```ts
{
   subject: '6d4b0b68-020a-48ba-ad50-54f7da55b04f',
   preferredUsername: '+905551112233',
   realmRoles: ['portal_user'],
   clientRoles: ['canteen_operator', 'wallet_cashier'],
}
```

### `sub` zorunluluğu

```ts
if (typeof claims.sub !== 'string') {
  throw new Error('Token içinde sub alanı bulunamadı.');
}
```

`sub` kullanıcı kimliğinin temelidir. String değilse token uygulama tarafından
kullanılabilir kabul edilmez.

### `resource_access` kontrolü

```ts
const resourceAccess =
  typeof claims.resource_access === 'object' && claims.resource_access !== null
    ? claims.resource_access
    : {};
```

JWT dışarıdan geldiği için içindeki her alanın doğru tipte olduğu varsayılmaz.
Bu kod `resource_access` alanı object değilse boş object kullanır.

### Yalnızca `portal-api` client rollerini alma

```ts
const portalApiAccess =
  'portal-api' in resourceAccess ? resourceAccess['portal-api'] : undefined;
```

Keycloak aynı token içinde birden fazla client'ın rollerini taşıyabilir. Bu API
yalnızca kendi client'ı olan `portal-api` rollerini kullanır. Başka bir client'a
ait rol bu API için yetki sayılmaz.

### Güvenli rol okuma: `readRoles`

```ts
function readRoles(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('roles' in value)) {
    return [];
  }

  const roles = value.roles;
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : [];
}
```

Bu yardımcı fonksiyon `realm_access` veya client access nesnesinden `roles`
array'ini çıkarır. `unknown` kullanıldığı için fonksiyon gelen veriye güvenmek
yerine önce tip kontrolü yapar.

Örneğin:

```ts
readRoles({ roles: ['portal_user', 42, null] });
// ['portal_user']

readRoles(undefined);
// []
```

Sadece string rollerin kullanılmasına izin verilir.

## 10. `roles.decorator.ts`: endpoint kuralını tanımlamak

```ts
export const REQUIRED_ROLES_KEY = 'requiredRoles';
export const ANY_REQUIRED_ROLES_KEY = 'anyRequiredRoles';

export const RequireRoles = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);

export const RequireAnyRole = (...roles: string[]) =>
  SetMetadata(ANY_REQUIRED_ROLES_KEY, roles);
```

Decorator'lar doğrudan rol kontrolü yapmaz. Sadece endpoint üzerine metadata
yazar. Kontrolü daha sonra `RolesGuard` yapar.

### Tüm roller zorunlu: `RequireRoles`

```ts
@RequireRoles('platform_admin', 'portal_user')
```

Bu şu anlama gelir:

```text
platform_admin VE portal_user
```

Kullanıcı iki role de sahip olmalıdır.

### Rollerden biri yeterli: `RequireAnyRole`

```ts
@RequireAnyRole('canteen_manager', 'canteen_operator')
```

Bu şu anlama gelir:

```text
canteen_manager VEYA canteen_operator
```

Kullanıcı bu rollerden yalnızca birine sahip olsa yeterlidir.

### İki decorator birlikte

```ts
@RequireRoles('portal_user')
@RequireAnyRole('canteen_manager', 'canteen_operator')
```

Bu kural şöyledir:

```text
portal_user VE (canteen_manager VEYA canteen_operator)
```

## 11. `roles.guard.ts`: yetki kararının verilmesi

### Endpoint metadata'sını okuma

```ts
const requiredRoles = this.reflector.getAllAndOverride<string[]>(
  REQUIRED_ROLES_KEY,
  [context.getHandler(), context.getClass()],
);

const anyRequiredRoles = this.reflector.getAllAndOverride<string[]>(
  ANY_REQUIRED_ROLES_KEY,
  [context.getHandler(), context.getClass()],
);
```

Guard, endpoint method'unda veya controller sınıfında tanımlanan
`@RequireRoles` ve `@RequireAnyRole` metadata'sını okur.

### Rol kuralı yoksa

```ts
if (!requiredRoles?.length && !anyRequiredRoles?.length) {
  return true;
}
```

Bu endpoint'in rol kısıtlaması olmadığı anlamına gelir. Ancak endpoint yine de
`JwtAuthGuard` tarafından korunuyor olabilir. Yani:

```text
Rol gerekmiyor != Public
```

Rol metadata'sı yoksa herhangi bir geçerli JWT sahibi kullanıcı endpoint'e
girebilir.

### Kullanıcının rollerini birleştirme

```ts
const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();

const assignedRoles = new Set([...user.realmRoles, ...user.clientRoles]);
```

Örneğin:

```ts
user.realmRoles = ['portal_user'];
user.clientRoles = ['canteen_operator', 'wallet_cashier'];
```

tek bir role kümesine dönüşür:

```ts
assignedRoles = new Set(['portal_user', 'canteen_operator', 'wallet_cashier']);
```

Bundan sonra rol kontrolü `assignedRoles.has('rol_adi')` şeklinde yapılır.

### Bütün zorunlu rolleri kontrol etme

```ts
const hasEveryRequiredRole =
  !requiredRoles?.length ||
  requiredRoles.every((role) => assignedRoles.has(role));
```

`requiredRoles` boşsa kontrol otomatik başarılıdır. Doluysa `every`, listedeki
her rolün kullanıcıda olmasını ister.

Örnek:

```ts
requiredRoles = ['portal_user', 'platform_admin'];
assignedRoles = new Set(['portal_user', 'platform_admin']);
// true
```

```ts
requiredRoles = ['portal_user', 'platform_admin'];
assignedRoles = new Set(['portal_user']);
// false
```

### Alternatif rollerden birini kontrol etme

```ts
const hasAnyRequiredRole =
  !anyRequiredRoles?.length ||
  anyRequiredRoles.some((role) => assignedRoles.has(role));
```

`anyRequiredRoles` boşsa kontrol otomatik başarılıdır. Doluysa `some`, en az
bir rolün kullanıcıda bulunmasını yeterli kabul eder.

### Son yetki kararı

```ts
if (!hasEveryRequiredRole || !hasAnyRequiredRole) {
  throw new ForbiddenException('Bu işlem için gerekli rol bulunmuyor.');
}

return true;
```

İki koşuldan biri başarısızsa `403 Forbidden` döner. Bu, kullanıcının token'ının
geçerli ancak yetkisinin yetersiz olduğu anlamına gelir.

## 12. HTTP hata durumları

### Token yoksa: `401 Unauthorized`

```http
GET /api/v1/canteen/orders
```

Header olmadığı için `JwtAuthGuard` isteği durdurur. Controller çalışmaz.

### Token formatı yanlışsa: `401 Unauthorized`

```http
Authorization: Basic abc123
```

Kod yalnızca `Bearer ` formatını kabul eder.

### Token geçersizse: `401 Unauthorized`

Token'ın süresi dolmuşsa, imzası değişmişse veya issuer/audience yanlışsa
`jwtVerify` hata verir. Kullanıcı doğrulanamadığı için `401` döner.

### Token geçerli ama rol yoksa: `403 Forbidden`

Kullanıcının token'ı geçerli, fakat endpoint `platform_admin` istiyor ve
kullanıcıda yalnızca `portal_user` varsa `RolesGuard` `403` döner.

Bu farkı şöyle hatırlayabilirsin:

```text
401 = Seni tanıyamadım.
403 = Seni tanıyorum ama bunu yapmana izin yok.
```

## 13. Baştan sona somut örnek

Endpoint:

```ts
@RequireAnyRole('canteen_manager', 'canteen_operator')
@Get('orders')
getOrders() {
   return this.orderService.findAll();
}
```

İstek:

```http
GET /api/v1/canteen/orders
Authorization: Bearer <JWT>
```

JWT claim'leri:

```json
{
  "sub": "user-id",
  "realm_access": { "roles": ["portal_user"] },
  "resource_access": {
    "portal-api": { "roles": ["canteen_operator"] }
  }
}
```

Verinin dönüşüm adımları:

```text
claims.sub
   -> user.subject = 'user-id'

claims.realm_access.roles
   -> user.realmRoles = ['portal_user']

claims.resource_access['portal-api'].roles
   -> user.clientRoles = ['canteen_operator']

user.realmRoles + user.clientRoles
   -> assignedRoles = {'portal_user', 'canteen_operator'}
```

Endpoint `canteen_manager` veya `canteen_operator` istediği için kullanıcıdaki
`canteen_operator` rolü yeterlidir. `RolesGuard` `true` döner ve controller
çalışır.

## 14. Mevcut roller

| Rol                | Temel yetki                                       |
| ------------------ | ------------------------------------------------- |
| `portal_user`      | Genel portal erişimi                              |
| `platform_admin`   | Uygulama kullanıcıları oluşturma                  |
| `wallet_cashier`   | Cüzdan arama, bakiye yükleme ve yükleme geri alma |
| `canteen_manager`  | Yemekhane kataloğunun tam yönetimi                |
| `canteen_operator` | Stok, görünürlük, sipariş durumu ve sipariş akışı |

## 15. Testlerin anlattığı davranış

`keycloak-jwt.service.spec.ts`, ham Keycloak claim'lerinin doğru uygulama
nesnesine dönüştüğünü kontrol eder:

```ts
expect(user).toEqual({
  subject: '6d4b0b68-020a-48ba-ad50-54f7da55b04f',
  preferredUsername: '+905551112233',
  realmRoles: ['portal_user'],
  clientRoles: ['canteen_operator', 'wallet_cashier'],
});
```

`roles.guard.spec.ts` ise şu kuralları doğrular:

- Kullanıcı bütün zorunlu rollere sahipse erişim verilir.
- Zorunlu rollerden biri eksikse `ForbiddenException` atılır.
- Alternatif rollerden en az biri varsa erişim verilir.
- Alternatif rollerin hiçbiri yoksa `ForbiddenException` atılır.

Testler gerçek Keycloak sunucusuna bağlanmaz. Claim dönüşümünü ve rol kararını
izole şekilde kontrol eder.

## 16. Yeni korumalı endpoint eklerken

```ts
@RequireRoles('platform_admin')
@Post('users')
createUser(@Body() input: CreateUserInput) {
   // ...
}
```

Şunlara dikkat edilmelidir:

1. Endpoint gerçekten public değilse `@Public()` eklenmemelidir.
2. Kullanıcı kimliği `request.user.subject` içinden alınmalıdır.
3. İstek body'sinden gelen kullanıcı kimliğine güvenilmemelidir.
4. Gerekli en dar rol kuralı seçilmelidir.
5. Yeni rol kombinasyonları için guard veya controller testi eklenmelidir.
6. Web uygulamasındaki ön kontrol yalnızca kullanıcı deneyimi içindir; asıl
   güvenlik sınırı API'deki global guard'lardır.

Son cümleyle özetlersek: Keycloak kullanıcının kimliğini imzalı token ile
kanıtlar, `JwtAuthGuard` bu kanıtı doğrular, `authUserFromClaims` bilgiyi
uygulamanın anlayacağı hale getirir ve `RolesGuard` kullanıcının hangi işlemi
yapabileceğine karar verir.
