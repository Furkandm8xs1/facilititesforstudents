# Profesyonel GitHub İş Akışı: Branch, Pull Request, Merge ve CI/CD

Bu rehber; bir değişikliğin fikir aşamasından başlayıp güvenli biçimde `main`
dalına ve daha sonra üretim ortamına ulaşmasına kadar geçen süreci anlatır.

## İçindekiler

- [Kısa cevap: düşündüğün sistem doğru mu?](#kısa-cevap-düşündüğün-sistem-doğru-mu)
- [Pull Request gerçekte ne yapar?](#pull-request-gerçekte-ne-yapar)
- [Merge ne yapar, ne yapmaz?](#merge-ne-yapar-ne-yapmaz)
- [GitHub'daki üç merge yöntemi](#githubdaki-üç-merge-yöntemi)
- [Merge conflict ile CI hatası aynı şey değildir](#merge-conflict-ile-ci-hatası-aynı-şey-değildir)
- [Büyük şirketlerde tipik akış](#büyük-şirketlerde-tipik-akış)
- [Branch stratejileri](#branch-stratejileri)
- [Örnek CI workflow'u](#örnek-ci-workflowu)
- [`main` branch nasıl korunur?](#main-branch-nasıl-korunur)
- [Auto-merge ve merge queue](#auto-merge-ve-merge-queue)
- [CI, delivery ve deployment farkı](#continuous-integration-delivery-ve-deployment-farkı)
- [Günlük geliştirici akışı](#günlük-geliştirici-akışı)
- [Bu repository için önerilen gelişim planı](#bu-repository-için-önerilen-gelişim-planı)

## Kısa cevap: düşündüğün sistem doğru mu?

Büyük ölçüde doğru:

1. Güncel `main` dalından yeni ve kısa ömürlü bir branch açılır.
2. Geliştirme bu branch üzerinde küçük ve anlamlı commit'lerle yapılır.
3. Branch GitHub'a gönderilir ve bir Pull Request açılır.
4. CI; lint, test, build ve güvenlik kontrollerini otomatik çalıştırır.
5. İnsanlar kodu ve ürün davranışını inceler.
6. Zorunlu kontroller ve onaylar geçmeden `main` dalına merge edilmez.
7. Merge sonrasında CD sistemi aynı kodu test, staging ve production
   ortamlarına taşır.

Ancak üç önemli düzeltme var:

- **CI çakışmaları çözmez.** Git'in bulduğu metinsel çakışmaları geliştirici
  çözer. CI, derleme veya test hatalarını gösterir.
- **Testler her mantıksal problemi yakalayamaz.** Yalnızca yazılmış testlerin,
  statik analizlerin ve güvenlik kurallarının kapsadığı problemleri bulabilir.
- **Başarılı CI otomatik olarak merge anlamına gelmez.** Otomatik merge için
  repository ayarlarında branch kuralları ve auto-merge veya merge queue ayrıca
  yapılandırılmalıdır.

Bu repository için önemli not: şu anda `.github/workflows/` dizini yoktur.
Dolayısıyla yerelde çalıştırdığımız testler başarılı olsa da GitHub üzerinde
henüz otomatik CI çalışmamaktadır.

## Temel kavramlar

| Kavram       | Anlamı                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------- |
| Repository   | Projenin dosyalarıyla birlikte bütün Git geçmişi                                         |
| Working tree | Bilgisayarında o anda gördüğün ve düzenlediğin dosyalar                                  |
| Commit       | Belirli bir andaki, açıklamalı ve kimliklendirilmiş değişiklik paketi                    |
| Branch       | Bir commit'i gösteren, geliştirme ilerledikçe hareket eden isimli işaretçi               |
| `main`       | Genellikle yayınlanabilir ve korunan ana geliştirme hattı                                |
| Push         | Yerel commit'leri GitHub gibi uzak repository'ye gönderme                                |
| Pull Request | Bir branch'teki değişikliğin başka bir branch'e alınması için inceleme ve kontrol talebi |
| Review       | Başka bir geliştiricinin kodu, tasarımı ve riskleri incelemesi                           |
| CI           | Her değişiklikte otomatik doğrulama: lint, test, build, tarama vb.                       |
| Merge        | İki geliştirme geçmişini birleştirme                                                     |
| CD           | Doğrulanmış çıktıyı test veya üretim ortamlarına taşıma                                  |

Branch, projenin ayrı bir kopyası değildir. Git açısından yalnızca belirli bir
commit'i gösteren hafif bir işaretçidir. Bu nedenle her iş için branch açmak
hızlı ve ucuzdur.

## Pull Request gerçekte ne yapar?

Pull Request, "bu kodu doğrudan `main` dalına yaz" komutu değildir. Önce bir
**öneri ve kalite kapısı** oluşturur.

Bir PR şu bilgileri tek yerde toplar:

- Kaynak branch: örneğin `feature/tea-cafe`
- Hedef branch: örneğin `main`
- İki branch arasındaki dosya ve satır farkları
- Commit geçmişi
- CI sonuçları
- Review yorumları ve onaylar
- İlgili issue/ticket bağlantıları
- Merge kararı ve sonradan izlenebilen tartışma geçmişi

Tea & Cafe geliştirmemizde:

- `main`, özellik başlamadan önceki kararlı kodu gösteriyordu.
- `feature/tea-cafe`, backend ve frontend commit'lerini taşıyordu.
- PR, bu iki dal arasındaki farkı gösterdi.
- Merge işlemi bu değişiklikleri `main` geçmişine dahil etti.
- Yerel `main`, GitHub'daki yeni geçmişi ancak `git pull` sonrasında aldı.

Pull Request'in en büyük faydası yalnızca "kod birleştirmek" değildir. Değişiklik
henüz ana hatta girmeden önce ortak bir review, otomasyon ve karar alanı sağlar.

## Merge ne yapar, ne yapmaz?

Merge, PR'ın kaynak branch'indeki onaylanmış değişiklikleri hedef branch'in Git
geçmişine dahil eder. Seçilen yönteme göre commit geçmişinin şekli değişir.

Merge sonrasında:

- `main` artık yeni özelliği içerir.
- PR "Merged" durumuna geçer ve geçmiş olarak saklanır.
- Kaynak branch istenirse silinebilir.
- `main` üzerinde çalışan bir deployment workflow varsa yayın süreci başlayabilir.
- Diğer geliştiriciler güncel kodu `git pull` ile alabilir.

Merge tek başına şunları yapmaz:

- Uygulamayı otomatik olarak production'a kurmaz.
- Veritabanını kendiliğinden yedeklemez veya migrate etmez.
- Kodun hatasız olduğunu garanti etmez.
- Yerel bilgisayarındaki `main` dalını otomatik güncellemez.
- Feature branch'i her zaman otomatik silmez.

Bunların yapılması repository, CI/CD ve deployment ayarlarına bağlıdır.

## GitHub'daki üç merge yöntemi

GitHub üç temel yöntemi destekler:

| Yöntem                | Sonuç                                                                     | Ne zaman uygun?                                                            |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Create a merge commit | PR commit'lerini korur ve ayrıca bir merge commit'i oluşturur             | Commit'ler anlamlıysa ve PR sınırları geçmişte açıkça görülsün isteniyorsa |
| Squash and merge      | PR içindeki bütün commit'leri `main` üzerinde tek commit'e dönüştürür     | Çok sayıda küçük veya düzeltme commit'i bulunan PR'larda temiz geçmiş için |
| Rebase and merge      | Commit'leri `main` ucuna tek tek yeniden yazar, merge commit'i oluşturmaz | Doğrusal geçmiş ve düzenli commit'ler isteyen ekiplerde                    |

GitHub'ın resmi açıklaması için
[Pull request merges](https://docs.github.com/en/pull-requests/reference/pull-request-merges)
rehberine bakılabilir.

### Hangisini seçmeliyiz?

Bu proje için iki makul tercih vardır:

- **Squash and merge:** Her PR tek mantıksal değişiklik olur. Yeni başlayan ve
  küçük ekipler için geçmişi okumak kolaydır.
- **Create a merge commit:** Tea & Cafe örneğindeki backend ve frontend gibi
  anlamlı ayrı commit'leri korur. PR sınırı da merge commit'iyle görünür.

Ekip bir yöntem seçmeli ve tutarlı kullanmalıdır. Aynı repository'de rastgele
farklı yöntemler kullanmak geçmişi okumayı zorlaştırır.

Squash merge kullanılıyorsa merge edilmiş eski branch üzerinde geliştirmeye
devam etmek yerine güncel `main` üzerinden yeni branch açmak özellikle
önemlidir. Eski commit kimlikleri `main` üzerinde tek bir yeni commit'e
dönüştürüldüğü için aynı branch'i tekrar kullanmak şaşırtıcı karşılaştırmalar
ve tekrar eden çakışmalar oluşturabilir.

## Merge conflict ile CI hatası aynı şey değildir

### 1. Metinsel merge conflict

İki branch aynı dosyanın aynı bölgesini uyumsuz biçimde değiştirmişse Git hangi
satırın doğru olduğuna karar veremez.

Örnek:

- Bir geliştirici `main` üzerinde buton metnini "Kaydet" yaptı.
- Başka bir geliştirici feature branch'te aynı satırı "Oluştur" yaptı.
- Git iki niyetten hangisinin doğru olduğunu bilemez.

Bu durumda GitHub PR'ı merge edilebilir saymaz. Geliştirici branch'i günceller,
çakışan dosyayı açar, doğru sonucu seçer ve yeni bir commit gönderir.

### 2. Derleme veya test çakışması

Dosyalar metinsel olarak sorunsuz birleşebilir ama birlikte çalışmayabilir:

- Backend bir alanın adını değiştirmiştir.
- Frontend hâlâ eski alanı kullanıyordur.
- Git metinsel conflict bulmaz.
- TypeScript veya entegrasyon testi hata verir.

CI özellikle bu sınıftaki problemleri yakalamaya yardım eder.

### 3. Davranışsal veya ürün hatası

Kod derlenir ve bütün mevcut testler geçer, fakat kullanıcı açısından yanlış
davranabilir. Örneğin sayaç doğru çalışırken yanlış zaman dilimini gösterebilir.
Bu yüzden otomasyonun yanında insan review'ı, ürün testi, gözlemlenebilirlik ve
iyi test kapsamı gerekir.

## CI, PR kodunu `main` ile gerçekten birlikte test eder mi?

GitHub Actions'ta `pull_request` olayı kullanıldığında, standart checkout
davranışı açık ve birleştirilebilir PR için GitHub'ın oluşturduğu geçici merge
referansını kullanır. Yani çoğu standart CI akışında yalnızca feature branch'in
tek başına hali değil, onun mevcut base branch ile önerilen birleşmiş sonucu
test edilir.

Bu davranış
[GitHub Actions `pull_request` olayı](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)
dokümanında açıklanır.

Yine de yarış durumu olabilir:

1. PR-A mevcut `main` ile test edilir ve başarılı olur.
2. PR-B önce merge edilerek `main` dalını değiştirir.
3. PR-A'nın eski başarılı sonucu yeni `main` ile aynı kombinasyonu test etmemiş
   olabilir.

Küçük ekipler bunu "Require branches to be up to date before merging" kuralıyla
yönetebilir. Çok sayıda PR'ın aynı anda merge edildiği büyük ekipler ise merge
queue kullanır. Queue, aday değişiklikleri en güncel `main` ile sıraya koyup
yeniden test eder.

## Büyük şirketlerde tipik akış

```mermaid
flowchart LR
    A[Issue / ürün gereksinimi] --> B[Tasarım veya teknik plan]
    B --> C[Güncel main'den kısa ömürlü branch]
    C --> D[Kod ve küçük commit'ler]
    D --> E[Push ve Pull Request]
    E --> F[CI: lint, test, build, security]
    E --> G[İnsan review / CODEOWNERS]
    F --> H{Bütün zorunlu kontroller geçti mi?}
    G --> H
    H -- Hayır --> D
    H -- Evet --> I[Auto-merge veya merge queue]
    I --> J[main]
    J --> K[Değişmez build artifact / container]
    K --> L[Test ortamı]
    L --> M[Staging]
    M --> N{Production onayı veya otomatik kural}
    N --> O[Canary / blue-green yayın]
    O --> P[Metric, log ve alarm takibi]
    P -- Sorun --> Q[Rollback veya feature flag kapatma]
```

Her şirkette bütün adımlar aynı değildir. Risk seviyesi, ekip büyüklüğü,
regülasyon ve ürünün kullanıcı sayısı süreci belirler.

### Geliştiriciler ne yapar?

- Issue veya ürün gereksinimini anlar.
- Teknik yaklaşımı gerektiğinde ekip ile tasarlar.
- Branch açar, kodu ve testleri yazar.
- Küçük ve anlaşılır commit'ler oluşturur.
- PR açıklamasında neden, kapsam, test ve riskleri belirtir.
- Review geri bildirimlerini uygular.
- Yayın sonrasında kendi değişikliğinin metriklerini takip eder.

### DevOps veya platform ekipleri ne yapar?

"DevOps" yalnızca kodu merge eden ayrı bir kişi anlamına gelmez. Modern
organizasyonlarda platform/SRE/DevOps ekipleri genellikle geliştiricilerin
güvenli biçimde kendi değişikliklerini yayınlayabileceği ortak yolu kurar:

- CI workflow şablonları
- Güvenli runner altyapısı
- Artifact ve container registry
- Secret yönetimi
- Test, staging ve production ortamları
- Infrastructure as Code
- Deployment stratejileri
- Log, metric, trace ve alarm sistemleri
- Rollback ve olay müdahale araçları
- Güvenlik ve uyumluluk politikaları

Kodun doğruluğundan yalnızca DevOps değil, ürünü geliştiren ekip sorumludur.
DevOps/platform ekibi güvenli "yolu" otomatikleştirir; geliştiriciler bu yolun
üzerinden ilerler.

## Branch stratejileri

### Kısa ömürlü feature branch / trunk-based yaklaşım

Günümüzde birçok ekip şu modeli kullanır:

- `main` her zaman çalışır ve yayınlanabilir tutulur.
- Her değişiklik güncel `main` üzerinden açılan kısa ömürlü branch'te yapılır.
- PR küçük tutulur ve mümkünse aynı gün veya birkaç gün içinde merge edilir.
- Büyük özellikler feature flag arkasında parça parça merge edilir.

Örnek isimler:

```text
feature/tea-cafe-ui-polish
fix/coffee-countdown-timezone
docs/github-professional-workflow
chore/update-node-version
hotfix/login-regression
```

Bu yaklaşım uzun yaşayan branch'lerin `main` dalından uzaklaşıp çok sayıda
çakışma üretmesini azaltır.

### GitFlow

Bazı şirketler `main`, `develop`, release ve hotfix branch'leri kullanan daha
ağır GitFlow süreçlerini tercih eder. Birden fazla desteklenen ürün sürümü veya
uzun release doğrulaması varsa yararlı olabilir. Sürekli yayın yapan web
uygulamalarında ise çoğu zaman gereğinden fazla branch ve merge yükü yaratır.

Bu portal için başlangıçta kısa ömürlü feature branch + korunan `main` modeli
daha uygundur.

## Örnek CI workflow'u

Aşağıdaki örnek bu monorepo için temel bir başlangıçtır. Dosya
`.github/workflows/ci.yml` altında tutulabilir:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:
    types: [checks_requested]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    name: lint-test-build
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      AUTH_SECRET: ci-only-placeholder-secret
      AUTH_KEYCLOAK_ID: portal-web
      AUTH_KEYCLOAK_SECRET: ci-only-placeholder-client-secret
      AUTH_KEYCLOAK_ISSUER: http://localhost:8080/realms/hizmet
      API_BASE_URL: http://localhost:3001/api/v1
      DATABASE_URL: postgresql://hizmet:hizmet@localhost:5432/hizmet
      KEYCLOAK_ISSUER: http://localhost:8080/realms/hizmet
      KEYCLOAK_AUDIENCE: portal-api
      KEYCLOAK_ADMIN_CLIENT_ID: portal-admin-service
      KEYCLOAK_ADMIN_CLIENT_SECRET: ci-only-placeholder-admin-secret
      KEYCLOAK_PORTAL_API_CLIENT_UUID: 844594e4-a183-46a3-80a7-97fdb6236d20

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Use Node.js 24
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Check formatting
        run: npm run format:check

      - name: Lint and type-check
        run: npm run lint

      - name: Run tests
        run: npm test

      - name: Build production applications
        run: npm run build
```

Bu workflow üç durumda çalışır:

- `main` hedefli PR açıldığında veya branch'e yeni commit gönderildiğinde
- Kod `main` dalına girdikten sonra
- Bir PR merge queue'ya eklendiğinde

`merge_group` tetikleyicisi, merge queue kullanılacaksa önemlidir; aksi halde
queue için gereken status check üretilmeyebilir. GitHub bu ayrıntıyı
[workflow event belgelerinde](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
özellikle belirtir.

Bu temel workflow yalnızca unit test, lint ve build çalıştırır. Daha profesyonel
bir pipeline zamanla şunları da ekleyebilir:

- PostgreSQL ve Keycloak service container'larıyla entegrasyon testleri
- Migration'ın boş ve eski bir veritabanında denenmesi
- API contract testleri
- Browser tabanlı uçtan uca testler
- Dependency ve container vulnerability taraması
- Secret taraması
- Kod kapsamı eşikleri
- Docker image build ve registry'ye gönderme
- Software Bill of Materials üretme

## `main` branch nasıl korunur?

Sadece CI dosyası eklemek yeterli değildir. Geliştirici başarısız kontrole
rağmen doğrudan `main` dalına push edebiliyorsa kalite kapısı isteğe bağlı kalır.

GitHub'da `main` için branch protection veya ruleset yapılandırılır. Tipik
kurallar:

- Doğrudan push yerine Pull Request zorunlu
- En az bir veya iki review onayı zorunlu
- CODEOWNERS onayı zorunlu
- Belirlenen status check'ler zorunlu
- Review konuşmalarının çözülmesi zorunlu
- Son commit'in onaylanması zorunlu
- Force push ve branch silme kapalı
- Yöneticilerin kuralları atlaması sınırlandırılmış
- Yoğun repository'lerde merge queue zorunlu

GitHub'ın korunan branch seçenekleri
[About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
sayfasında açıklanır. Zorunlu status check başarısızsa GitHub PR'ın merge
edilmesini engelleyebilir.

### Bu repository için önerilen başlangıç ayarları

`main` hedefi için:

1. Require a pull request before merging
2. Require status checks to pass before merging
3. Zorunlu check: `lint-test-build`
4. Require conversation resolution before merging
5. Block force pushes
6. Block branch deletion

Repository tek kişi tarafından geliştiriliyorsa zorunlu başka kişi onayı
başlangıçta pratik olmayabilir. Yine de PR ve status check zorunluluğu
korunmalıdır. Ekip büyüdüğünde en az bir review ve CODEOWNERS eklenebilir.

## Auto-merge ve merge queue

### Auto-merge

Auto-merge etkinleştirildiğinde geliştirici, gerekli kontroller henüz devam
ederken PR için merge yöntemini seçebilir. Bütün zorunlu review ve status
check'ler başarılı olduktan sonra GitHub PR'ı otomatik merge eder.

Auto-merge başarısız testleri atlamaz; koruma kurallarının tamamlanmasını
bekler. Ayrıntılar
[Automatically merging a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
rehberindedir.

### Merge queue

Merge queue özellikle aynı anda çok sayıda PR'ın tamamlandığı repository'lerde
yararlıdır:

1. Onaylı PR kuyruğa girer.
2. GitHub PR'ı en güncel `main` ve sıradaki diğer adaylarla geçici olarak
   birleştirir.
3. CI bu merge grubu üzerinde yeniden çalışır.
4. Başarılı grup sırayla `main` dalına alınır.
5. Bir PR grubu bozarsa kuyruktan çıkarılır; diğerleri ilerlemeye devam eder.

Bu, "PR test edildi ama hemen öncesinde başka PR merge edilince main bozuldu"
riskini azaltır. Merge queue için CI workflow'larının `merge_group` olayını da
dinlemesi gerekir.

## Continuous Integration, Delivery ve Deployment farkı

### Continuous Integration — CI

Değişikliklerin sık sık ortak hatta entegre edilmesini ve her değişikliğin
otomatik doğrulanmasını hedefler:

- Derleniyor mu?
- Tip kontrolü geçiyor mu?
- Testler geçiyor mu?
- Kod biçimi ve lint kuralları doğru mu?
- Bilinen güvenlik açıkları var mı?

### Continuous Delivery

Başarılı değişiklik her an production'a gönderilebilecek şekilde paketlenir ve
staging'e kadar otomatik ilerler. Production geçişi için insan onayı olabilir.

### Continuous Deployment

Bütün kalite kapılarını geçen değişiklik insan onayı olmadan production'a kadar
otomatik ilerler.

İki kavram sıkça "CD" olarak kısaltılır. Şirketin "CD kullanıyoruz" demesi,
production'a otomatik yayın yaptığı anlamına gelmeyebilir; onaylı continuous
delivery kullanıyor olabilir.

## Merge sonrasında profesyonel deployment

Tipik bir pipeline aynı commit'ten bir kez artifact üretir:

```text
main commit SHA
    → testler
    → Docker image: hizmet-api:<commit-sha>
    → registry
    → staging'de aynı image
    → onay/otomatik politika
    → production'da aynı image
```

Production için yeniden ve farklı bir image oluşturmak yerine staging'de test
edilmiş aynı değişmez artifact terfi ettirilir. Böylece "test edilen kod" ile
"yayınlanan kod" arasındaki fark azaltılır.

GitHub Environments ile:

- Belirli environment secret'ları tanımlanabilir.
- Production için required reviewer istenebilir.
- Yalnızca belirli branch'lerin deployment yapması sağlanabilir.
- Ortam koruma kuralları geçmeden job'ın başlaması ve secret'lara erişmesi
  engellenebilir.

Resmi ayrıntılar için
[Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
sayfasına bakılabilir.

### Güvenli yayın yöntemleri

- **Rolling deployment:** Instance'lar sırayla yeni sürüme geçirilir.
- **Blue-green:** Eski ve yeni ortam birlikte tutulur; trafik yeni ortama
  çevrilir, sorun olursa eski ortama dönülür.
- **Canary:** Önce küçük bir kullanıcı yüzdesi yeni sürümü alır; metrikler iyi
  ise oran artırılır.
- **Feature flag:** Kod production'dadır fakat özellik kontrollü biçimde
  kullanıcı gruplarına açılır.

## Veritabanı migration'ları nasıl ele alınır?

Migration, uygulama kodundan daha dikkatli yönetilir çünkü geri almak her zaman
kolay değildir.

Profesyonel yaklaşım:

- Migration dosyası kodla aynı PR'da review edilir.
- CI migration'ı temiz veritabanına uygular.
- Mümkünse önceki sürümden kopyalanmış şema üzerinde upgrade testi yapılır.
- Yedekleme ve geri dönüş planı belirlenir.
- Büyük tablolarda kilit ve çalışma süresi ölçülür.
- Uygulama ve migration geriye uyumlu aşamalara bölünür.

Örneğin bir kolonu tek adımda silmek yerine:

1. Yeni kolon eklenir.
2. Kod hem eski hem yeni yapıyla uyumlu yayınlanır.
3. Veriler taşınır.
4. Okumalar yeni kolona geçirilir.
5. Eski kolon daha sonraki bir release'te kaldırılır.

Bu modele expand-and-contract denir ve sıfır kesintili yayınlarda sık kullanılır.

## Review sırasında neler incelenir?

İyi bir review yalnızca yazım hatası aramaz:

- Gereksinim doğru çözülmüş mü?
- Yetkilendirme hem UI hem API seviyesinde uygulanmış mı?
- Kullanıcı girdileri sunucuda doğrulanmış mı?
- Eşzamanlı işlemler ve yarış koşulları düşünülmüş mü?
- Veritabanı migration'ı güvenli mi?
- Hata mesajları ve gözlemlenebilirlik yeterli mi?
- Testler yalnızca başarılı yolu değil hata yollarını da kapsıyor mu?
- Gizli bilgiler log veya repository'ye giriyor mu?
- Geri alma veya feature flag stratejisi var mı?
- Değişiklik gereğinden büyük mü?

PR küçükse review daha hızlı ve kaliteli olur. Bir PR'ın aynı anda refactor,
yeni özellik, dependency güncelleme ve biçim değişikliği yapması incelemeyi
zorlaştırır.

## CODEOWNERS ve PR şablonları

### CODEOWNERS

`.github/CODEOWNERS` dosyası belirli yolların doğal inceleyicilerini tanımlar:

```text
/apps/api/       @backend-team
/apps/web/       @frontend-team
/infra/          @platform-team
/apps/api/migrations/ @database-team
```

Branch koruması ile birlikte ilgili sahibin onayı zorunlu yapılabilir.

### Pull Request şablonu

`.github/pull_request_template.md` dosyası her PR'da aynı önemli soruların
yanıtlanmasını sağlar:

```markdown
## Neden?

## Neler değişti?

## Nasıl test edildi?

## Migration veya ortam değişkeni var mı?

## Risk ve geri dönüş planı

## Ekran görüntüleri
```

## Güvenlik açısından önemli noktalar

- Gerçek secret'ları YAML dosyasına yazma; GitHub Secrets veya environment
  secrets kullan.
- Workflow izinlerini en düşük seviyede tut; örneğin yalnızca
  `contents: read`.
- Üçüncü taraf action'ları güvenilir yayınlara veya mümkünse tam commit SHA'ya
  sabitle.
- Fork'tan gelen güvenilmeyen kodu production secret'larıyla çalıştırma.
- `pull_request_target` olayını bilinçsiz kullanma; base branch yetkileri ve
  secret'ları nedeniyle güvenlik riski oluşturabilir.
- Dependency, secret ve container taramalarını kalite kapısına ekle.
- Production deployment'ı korunan environment üzerinden çalıştır.

## Günlük geliştirici akışı

### 1. Güncel `main` dalından başla

```bash
git switch main
git pull --ff-only
```

### 2. İşe özel branch aç

```bash
git switch -c feature/tea-cafe-ui-polish
```

### 3. Küçük değişiklikler ve anlamlı commit'ler oluştur

```bash
git status
git diff
git add apps/web/src/app/tea-cafe
git commit -m "feat(web): improve tea cafe countdown"
```

### 4. Branch'i GitHub'a gönder

```bash
git push -u origin feature/tea-cafe-ui-polish
```

### 5. PR aç

- Base: `main`
- Compare: `feature/tea-cafe-ui-polish`
- Neden, kapsam, test, risk ve ekran görüntüsü ekle.
- CI sonuçlarını ve diff'i kontrol et.
- Review geri bildirimlerini aynı branch'e yeni commit olarak push et.

### 6. `main` değiştiyse branch'i güncelle

Başlangıç için anlaşılması en kolay yöntem:

```bash
git fetch origin
git switch feature/tea-cafe-ui-polish
git merge origin/main
```

Çakışma varsa dosyaları düzelt, testleri çalıştır, sonucu commit edip push et.

Ekip doğrusal geçmiş istiyorsa merge yerine rebase kullanabilir:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Rebase commit kimliklerini yeniden yazdığı için paylaşılan branch'lerde ekip
anlaşması olmadan kullanılmamalıdır. `--force` yerine daha güvenli olan
`--force-with-lease` tercih edilir.

### 7. Merge sonrasında yerel ortamı güncelle

```bash
git switch main
git pull --ff-only
git branch -d feature/tea-cafe-ui-polish
git push origin --delete feature/tea-cafe-ui-polish
```

Branch'in geçmişi kaybolmaz; commit'ler `main` ve PR geçmişinde bulunur. Branch
adı artık gerekli olmadığı için silinir.

## Hotfix süreci

Production'da acil bir hata olduğunda da doğrudan `main` dalına kontrolsüz push
etmek yerine:

1. Güncel production commit'inden kısa bir `hotfix/...` branch'i açılır.
2. En küçük güvenli düzeltme ve regression testi eklenir.
3. Hızlandırılmış fakat zorunlu CI ve review uygulanır.
4. Merge ve deployment yapılır.
5. Metrikler izlenir; gerekirse rollback yapılır.

Acil süreç kalite kapılarını tamamen kaldırmak yerine onların daha hızlı
çalışmasını sağlamalıdır.

## Bu repository için önerilen gelişim planı

### Aşama 1 — Temel CI

- `.github/workflows/ci.yml` ekle.
- `npm ci`, `npm run lint`, `npm test`, `npm run build` çalıştır.
- CI sonucunu PR üzerinde zorunlu status check yap.

### Aşama 2 — `main` koruması

- PR zorunluluğu getir.
- Başarılı CI ve çözülmüş konuşmaları zorunlu yap.
- Force push ve silmeyi kapat.
- Doğrudan `main` push etme alışkanlığını bırak.

### Aşama 3 — Review standardı

- PR şablonu ekle.
- Ekip oluşunca CODEOWNERS ekle.
- En az bir onay zorunluluğu getir.
- Küçük ve tek amaçlı PR kuralını benimse.

### Aşama 4 — Entegrasyon testleri

- CI içinde geçici PostgreSQL ve Keycloak başlat.
- Migration ve gerçek repository sorgularını test et.
- Kritik kullanıcı akışları için browser tabanlı testler ekle.

### Aşama 5 — CD

- Commit SHA ile etiketlenen Docker image üret.
- Önce staging ortamına yayınla.
- Smoke test çalıştır.
- Production environment için onay ve rollback politikası ekle.
- Trafik arttığında canary veya blue-green deployment kullan.

### Aşama 6 — Ölçek büyüdüğünde

- Auto-merge ve merge queue etkinleştir.
- Paralel test ve cache ile CI süresini azalt.
- Güvenlik, lisans ve tedarik zinciri kontrollerini zorunlu yap.
- Deployment başarısını metrik ve alarm sistemleriyle doğrula.

## Son kontrol listesi

Bir PR merge edilmeden önce:

- [ ] PR tek bir mantıksal işi çözüyor.
- [ ] Branch güncel `main` üzerinden açıldı.
- [ ] Kod okunabilir ve gereksiz değişiklik içermiyor.
- [ ] Yeni davranış için test eklendi.
- [ ] Lint, test ve build başarılı.
- [ ] Migration ve geriye uyumluluk değerlendirildi.
- [ ] Yetkilendirme ve girdi doğrulama kontrol edildi.
- [ ] Secret veya kişisel veri commit edilmedi.
- [ ] Review yorumları çözüldü.
- [ ] Risk ve rollback planı belli.
- [ ] Gerekliyse kullanıcı arayüzü ekran görüntüleri eklendi.
- [ ] Zorunlu status check ve onaylar geçti.

## Resmi GitHub kaynakları

- [Creating a pull request](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request)
- [Pull request merges](https://docs.github.com/en/pull-requests/reference/pull-request-merges)
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Status checks](https://docs.github.com/en/pull-requests/reference/status-checks)
- [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Automatically merging a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)
- [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
