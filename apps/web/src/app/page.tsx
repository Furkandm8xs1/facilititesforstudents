const services = [
  {
    title: 'Kantin',
    description: 'Ürünleri incele, sipariş ver ve teslim durumunu takip et.',
    status: 'Kullanıma hazırlanıyor',
    active: true,
  },
  {
    title: 'Laundry',
    description: 'Çamaşırhane hizmetleri bu portal üzerinden yönetilecek.',
    status: 'Sonraki aşama',
    active: false,
  },
  {
    title: 'Kitchen',
    description: 'Mutfak hizmetleri ortak giriş ve bakiyeyi kullanacak.',
    status: 'Sonraki aşama',
    active: false,
  },
] as const;

export default function Home() {
  return (
    <main className="portal-shell">
      <header className="portal-header">
        <div>
          <p className="eyebrow">Yurt içi hizmet ağı</p>
          <h1>İhtiyacın olan hizmetler tek yerde.</h1>
          <p className="intro">
            Ortak hesabın ve bakiyenle yurt hizmetlerine güvenli biçimde eriş.
          </p>
        </div>
        <div
          className="balance-card"
          aria-label="Bakiye alanı yakında etkinleşecek"
        >
          <span>Ortak bakiye</span>
          <strong>—</strong>
          <small>Giriş sonrasında görüntülenecek</small>
        </div>
      </header>

      <section aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Servisler</p>
            <h2 id="services-title">Bugün ne yapmak istersin?</h2>
          </div>
          <span className="network-state">Yurt ağına bağlı</span>
        </div>

        <div className="service-grid">
          {services.map((service, index) => (
            <article
              className={`service-card ${service.active ? 'service-card-active' : ''}`}
              key={service.title}
            >
              <span className="service-number">0{index + 1}</span>
              <div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </div>
              <span className="service-status">{service.status}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
