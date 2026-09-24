# Laundry frontend

- `/laundry` kullanıcının aktif yüklerini ve geçmişini salt okunur gösterir.
- `/laundry/manage` yalnız `laundry_operator` ve `laundry_manager` rollerine
  açıktır. Fiyat düzenleme yalnız yöneticiye gösterilir ve Server Action içinde
  ayrıca doğrulanır.
- Ücret doğuran create, transfer ve refund isteklerinin idempotency UUID'si
  form ömrü boyunca korunur ve yalnız başarılı işlemden sonra yenilenir.
- Kullanıcı ve yönetim ekranları 20 saniyede bir `router.refresh()` ile
  güncellenir; kalan süre sayaçları saniyede bir ilerler. API çağrıları
  `no-store` kullanır.
- Planlanan çıkış saati ve saat/dakika/saniye cinsinden kalan süre kullanıcı ve
  operatör kartlarında gösterilir.
- Makine listesi, API'nin uygunluk alanlarının yanında aktif run kayıtlarıyla
  da süzülür; operatöre yalnız boş makineler sunulur.
