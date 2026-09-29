# Tea Cafe: Cherry-pick Çakışması ve Güvenli Toparlama

Bu not, Tea Cafe demleme yetkisi değişikliğini yanlışlıkla yerel `main`
dalında commit ettikten sonra karşılaştığımız durumu ve düzeltme akışını
anlatır. Amaç, benzer bir durumda commit kaybetmeden doğru feature branch'e
dönmektir.

## Kısa özet

- Değişiklik önce yanlışlıkla **yerel** `main` dalında commit edildi.
- Bu commit GitHub'daki `main` dalına gönderilmemişti; bu nedenle uzak ana dal
  etkilenmedi.
- Commit'i eski `feature/tea-cafe` dalına `cherry-pick` etmeye çalışırken
  `apps/web/src/app/page.tsx` dosyasında çakışma oluştu.
- Çakışma sürerken verilen `reset --hard origin/main` komutu, dal değişimi
  başarısız olduğu için açık olan feature branch'i yerelde geri aldı.
- Commit, yerel `main` işaretçisi tarafından hâlâ gösterildiği için kaybolmadı.
  Feature branch, bu commit'e fast-forward edilip GitHub'a pushlandı.
- PR, `feature/tea-cafe` → `main` yönünde açıldı ve format düzeltmesinden sonra
  merge edildi.

## Başlangıçtaki Git grafiği

`1bb59aa` Tea Cafe yetki değişikliğinin commit'idir. Bu commit o anda yalnızca
yereldeki `main` dalındaydı; `origin/main` henüz bir önceki commit'i
gösteriyordu.

```text
origin/feature/tea-cafe
        |
        v
afb634c  --- eski Tea Cafe branch ucu
   \
    \                         origin/main
     \                             |
      \                            v
       `---- bd942ae --- 9206eba --- 1bb59aa
                                       ^
                                       |
                                  local main
```

Buradaki önemli ayrım şudur:

| İşaretçi | Anlamı |
| --- | --- |
| `main` | Bilgisayardaki yerel dal |
| `origin/main` | GitHub'daki dalın en son bilinen ucu |
| `feature/tea-cafe` | Bilgisayardaki feature dalı |
| `origin/feature/tea-cafe` | GitHub'daki feature dalı |

Yerel `main`in bir commit önde olması, commit'in otomatik olarak GitHub'a
gönderildiği anlamına gelmez. Bunu yalnızca `git push origin main` yapar.

## Neden `cherry-pick` çakıştı?

Kullanılan komutlar şunlardı:

```bash
git switch feature/tea-cafe
git cherry-pick 1bb59aa
```

`git cherry-pick <commit>`, seçilen commit'in dosya değişikliklerini aktif
dalın en üstüne yeni bir commit olarak uygular. Ancak eski
`feature/tea-cafe` dalı, `main`e sonradan gelen Laundry ve ana sayfa
değişikliklerini içermiyordu.

Tea Cafe commit'i de `apps/web/src/app/page.tsx` dosyasını değiştirdiği için
Git iki farklı bağlamı otomatik olarak birleştiremedi ve şunu verdi:

```text
CONFLICT (content): Merge conflict in apps/web/src/app/page.tsx
error: could not apply 1bb59aa... feat(tea-cafe): allow all users to manage brews
```

Grafik olarak, Git `T` commit'indeki değişikliği eski `F` dalına uygulamaya
çalışıyordu:

```text
                 T = 1bb59aa (Tea Cafe yetki değişikliği)
                /
... --- M = 9206eba
 \
  F = afb634c (eski feature/tea-cafe)
   \
    `-- cherry-pick T denemesi
          |
          `-- page.tsx için conflict
```

Çakışma bir CI hatası değildir. Git, aynı dosyanın yakındaki satırlarının iki
farklı geçmişte farklı biçimlerde değiştiğini söylemektedir. Normal çözüm
akışı şöyledir:

```bash
git status
# Çakışma işaretlerini (<<<<<<<, =======, >>>>>>>) elle çöz.
git add apps/web/src/app/page.tsx
git cherry-pick --continue
```

Bu olayda daha güvenli ve basit yol, commit'i eski branch'e kopyalamak yerine
feature branch'i güncel `main`e taşımaktı.

## `reset` neden beklenmedik dalı etkiledi?

Çakışmadan sonra şu iki komut art arda çalıştırıldı:

```bash
git switch main
git reset --hard origin/main
```

İlk komut, cherry-pick devam ettiği için başarısız oldu:

```text
fatal: cannot switch branch while cherry-picking
```

Kabuk, önceki komut başarısız olsa bile sonraki satırı çalıştırır. Bu yüzden
`git reset --hard origin/main` komutu hâlâ açık olan
`feature/tea-cafe` dalında çalıştı.

```text
Beklenen:                         Gerçekte olan:

main ------------ reset           feature/tea-cafe --- reset
                                      ^
                                      |
                              switch başarısız olduğu için aktif dal
```

`git reset --hard <hedef>` iki şeyi yapar:

1. Aktif branch işaretçisini hedef commit'e taşır.
2. Staging alanını ve çalışma dizinini o commit'in dosyalarıyla eşitler.

Bu nedenle komut, çakışma dosyalarını temizledi ve yerel feature branch'i
`origin/main`e getirdi. Bu komut veri kaybı riski taşıdığından, hangi dalın
aktif olduğunu `git branch --show-current` veya `git status` ile doğrulamadan
çalıştırılmamalıdır.

Ancak commit kaybolmamıştı: `main` hâlâ `1bb59aa` commit'ini gösteriyordu.
Git'te bir commit en az bir branch, tag veya reflog tarafından erişilebilir
olduğu sürece geri alınabilir.

## Uygulanan toparlama: fast-forward

Toparlama öncesindeki yerel durum şuydu:

```text
origin/feature/tea-cafe  afb634c
                           \
                            `--- 9206eba --- 1bb59aa
                                  ^            ^
                                  |            |
                       local feature       local main
```

Önce feature branch'te iken şu komut kullanıldı:

```bash
git merge --ff-only main
```

`--ff-only`, Git'e yalnızca merge commit oluşturmadan düz bir şekilde ileri
taşınabiliyorsa işlem yapmasını söyler. Çakışma veya ayrışmış iki geçmiş varsa
başarısız olur; bu nedenle güvenli bir kontrol noktasıdır.

Bu olayda `feature/tea-cafe`in mevcut ucu `main`in geçmişindeydi. Git sadece
feature branch işaretçisini `1bb59aa`ya ilerletti; yeni bir merge commit
oluşturmadı:

```text
Önce:

feature/tea-cafe
        |
        v
9206eba --- 1bb59aa
                ^
                |
               main

Sonra: git merge --ff-only main

9206eba --- 1bb59aa
                ^
                |
       main, feature/tea-cafe
```

Ardından:

```bash
git push origin feature/tea-cafe
```

komutu bu ilerletilmiş branch'i GitHub'a gönderdi. Uzak `main` değişmedi.

Son olarak yerel ana dal temizlendi:

```bash
git switch main
git reset --hard origin/main
```

Bu kez `git switch main` başarıyla tamamlandığı doğrulandıktan sonra reset
çalıştırıldı. Böylece yerel `main`, GitHub'daki `main` ile eşitlendi; Tea Cafe
commit'i ise uzak feature branch'te güvenle kaldı.

## Prettier kalite kapısı

PR CI kontrolünde aşağıdaki hata görüldü:

```text
[warn] .github/pull-request-rehberi.md
[warn] apps/api/src/modules/tea-cafe/README.md
Code style issues found in 2 files.
```

Bu, kod davranışında bir hata değil, dosyaların repository'nin Prettier biçim
kurallarına uymadığı anlamına gelir. Çözüm:

```bash
npx prettier --write .github/pull-request-rehberi.md apps/api/src/modules/tea-cafe/README.md
npx prettier --check .github/pull-request-rehberi.md apps/api/src/modules/tea-cafe/README.md
git add .github/pull-request-rehberi.md apps/api/src/modules/tea-cafe/README.md
git commit -m "style: format documentation"
git push origin feature/tea-cafe
```

- `--write`, biçimlendirmeyi dosyalara uygular.
- `--check`, dosya yazmadan yalnızca kontrol eder; başarılıysa sıfır çıkış
  kodu döner.
- `git add`, yalnızca listelenen iki dosyayı yeni commit için seçer.
- `git commit`, format değişiklikleri için ayrı ve açıklayıcı bir geçmiş kaydı
  oluşturur.
- `git push`, açık PR'ı otomatik olarak yeni commit ile günceller.

## PR ve merge işleminin grafiksel karşılığı

PR açılırken yön şu olmalıdır:

```text
base (hedef): main  <---  compare (kaynak): feature/tea-cafe
```

Bu, “feature branch'teki farkı `main`e alma önerisi” demektir. Tersini seçmek
eski veya ana dal değişikliklerini feature branch'e alma önerisi oluşturur.

PR merge edilmeden önce:

```text
origin/main:              9206eba
                              \
origin/feature/tea-cafe:       1bb59aa --- ef9f3bb
                                      Tea Cafe       Prettier
```

GitHub'da **Merge pull request** seçildiğinde bir merge commit oluşabilir:

```text
                             1bb59aa --- ef9f3bb
                            /                       \
9206eba -------------------                         980acc5
                                                       ^
                                                       |
                                                  origin/main
```

`980acc5`, Tea Cafe PR'ının GitHub'da oluşturduğu merge commit'tir. Bu commit,
hem önceki `main` geçmişini hem de feature branch'teki iki commit'i ebeveyn
olarak taşır. Böylece feature branch silinse bile değişiklikler `main`
geçmişinde kalır.

## Benzer bir durumda güvenli kontrol listesi

```bash
# 1. Önce hangi daldasın ve çalışma alanı temiz mi bak.
git status --short --branch
git branch --show-current

# 2. Commit'in hangi branch'lerde erişilebilir olduğunu gör.
git branch --contains <commit-kimligi>

# 3. Çakışma varsa durumunu incele.
git status

# 4. Çakışmayı çözmeyeceksen geri dön.
git cherry-pick --abort

# 5. Branch'i yalnızca güvenliyse ileri taşı.
git merge --ff-only <kaynak-dal>

# 6. Push öncesinde farkı kontrol et.
git log --oneline origin/<branch>..HEAD
git diff --check
```

`reset --hard`, `push --force` ve `rebase` gibi geçmişi veya çalışma
dosyalarını değiştirebilen komutlardan önce aktif branch'i doğrula ve gerekiyorsa
önce `git status` çıktısını incele.
