export const roleOptions = [
  {
    value: 'platform_admin',
    label: 'Platform yöneticisi',
    description: 'Kullanıcıları ve rollerini yönetir.',
  },
  {
    value: 'canteen_manager',
    label: 'Kantin yöneticisi',
    description: 'Ürünleri ve fiyatları yönetir.',
  },
  {
    value: 'canteen_operator',
    label: 'Kantin görevlisi',
    description: 'Stok ve sipariş akışını yönetir.',
  },
  {
    value: 'kitchen_manager',
    label: 'Mutfak yöneticisi',
    description: 'Mutfak ayarlarını ve yönetim işlemlerini yürütür.',
  },
  {
    value: 'kitchen_operator',
    label: 'Mutfak görevlisi',
    description: 'Mutfak günlük işlemlerini yönetir.',
  },
  {
    value: 'laundry_manager',
    label: 'Çamaşırhane yöneticisi',
    description: 'Çamaşırhane ayarlarını ve yönetim işlemlerini yürütür.',
  },
  {
    value: 'laundry_operator',
    label: 'Çamaşırhane görevlisi',
    description: 'Çamaşırhane günlük işlemlerini yönetir.',
  },
  {
    value: 'wallet_cashier',
    label: 'Cüzdan kasiyeri',
    description: 'Nakit yükleme ve gerekçeli düzeltme yapar.',
  },
] as const;
