# Laundry frontend

- `/laundry` kullanıcının aktif yüklerini ve geçmişini salt okunur gösterir.
- `/laundry/manage` yalnız `laundry_operator` ve `laundry_manager` rollerine
  açıktır. Fiyat düzenleme yalnız yöneticiye gösterilir ve Server Action içinde
  ayrıca doğrulanır.
- Ücret doğuran create, transfer ve refund isteklerinin idempotency UUID'si
  tarayıcıdan alınmaz; Server Action tarafından üretilir.
- Kullanıcı ve yönetim ekranları 20 saniyede bir `router.refresh()` ile
  güncellenir. API çağrıları `no-store` kullanır.
- Makine listesi, API'nin uygunluk alanlarının yanında aktif run kayıtlarıyla
  da süzülür; operatöre yalnız boş makineler sunulur.
