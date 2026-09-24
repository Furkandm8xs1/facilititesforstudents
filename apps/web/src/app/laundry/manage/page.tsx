import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { getLaundryManagement, type LaundryMachine } from '@/lib/api';

import { LaundryAutoRefresh } from '../auto-refresh';
import { LaundryLoadCard } from '../load-card';
import { CustomerSearch } from './customer-search';
import { LoadOperations } from './load-operations';
import { TariffForm } from './tariff-form';

function machineIsAvailable(machine: LaundryMachine): boolean {
  if (machine.available === false || machine.isAvailable === false)
    return false;
  if (machine.occupied === true) return false;
  if (!machine.status) return true;
  return ['AVAILABLE', 'IDLE', 'EMPTY', 'READY'].includes(
    machine.status.toUpperCase(),
  );
}

function normalizeMachine(machine: LaundryMachine): LaundryMachine | null {
  const machineType = machine.machineType ?? machine.type;
  const machineNumber = machine.machineNumber ?? machine.number;
  if (
    (machineType !== 'WASH' && machineType !== 'DRY') ||
    !Number.isInteger(machineNumber)
  ) {
    return null;
  }
  return { ...machine, machineType, machineNumber: machineNumber as number };
}

export default async function LaundryManagementPage() {
  const session = await auth();

  if (!session?.user || !session.apiAccessToken) {
    redirect('/login');
  }

  const isManager = session.user.roles.includes('laundry_manager');
  const isOperator = session.user.roles.includes('laundry_operator');
  if (!isManager && !isOperator) {
    redirect('/');
  }

  const management = await getLaundryManagement(session.apiAccessToken);
  const occupiedMachines = new Set(
    management?.activeLoads.flatMap((load) =>
      load.runs
        .filter((run) => !run.removedAt)
        .map((run) => `${run.machineType}-${run.machineNumber}`),
    ) ?? [],
  );
  const availableMachines =
    management?.machines
      .map(normalizeMachine)
      .filter((machine): machine is LaundryMachine => machine !== null)
      .filter(
        (machine) =>
          machineIsAvailable(machine) &&
          !occupiedMachines.has(
            `${machine.machineType}-${machine.machineNumber}`,
          ),
      ) ?? [];

  return (
    <main className="laundry-shell laundry-management-shell">
      <LaundryAutoRefresh />
      <nav className="laundry-nav">
        <Link className="back-link" href="/laundry">
          ← Laundry durumuna dön
        </Link>
        <Link className="text-action" href="/">
          Portal ana sayfası
        </Link>
      </nav>

      <header className="laundry-management-header">
        <p className="eyebrow">Laundry operasyonu</p>
        <h1>Makine ve yük yönetimi</h1>
        <p className="intro">
          Kullanıcıyı telefonuyla seç, yalnız boş makinelerde işlem başlat.
          Aktarım yeni bir ücret tahsil eder; iade tüm yükü kapsar.
        </p>
      </header>

      {!management ? (
        <p className="empty-state" role="alert">
          Laundry yönetim bilgilerine ulaşılamadı.
        </p>
      ) : (
        <>
          {isManager ? (
            <section className="laundry-tariff-section">
              <div>
                <p className="eyebrow">Yönetici ayarı</p>
                <h2>Hizmet fiyatları</h2>
                <p>
                  Yeni işlemlerde tahsil edilecek yıkama ve kurutma fiyatları.
                </p>
              </div>
              <TariffForm tariffs={management.tariffs} />
            </section>
          ) : null}

          <CustomerSearch
            machines={availableMachines}
            tariffs={management.tariffs}
          />

          <section aria-labelledby="active-loads-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Canlı operasyon</p>
                <h2 id="active-loads-title">Aktif yükler</h2>
              </div>
              <span className="network-state">
                {management.activeLoads.length} aktif
              </span>
            </div>
            {management.activeLoads.length ? (
              <div className="laundry-operation-list">
                {management.activeLoads.map((load) => (
                  <LoadOperations
                    load={load}
                    machines={availableMachines}
                    tariffs={management.tariffs}
                    key={load.id}
                  />
                ))}
              </div>
            ) : (
              <p className="empty-state">Şu anda aktif yük bulunmuyor.</p>
            )}
          </section>

          <section aria-labelledby="recent-loads-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Son işlemler</p>
                <h2 id="recent-loads-title">Tamamlanan ve iade edilenler</h2>
              </div>
              <span className="network-state">
                {management.recentLoads.length} kayıt
              </span>
            </div>
            <div className="laundry-load-list">
              {management.recentLoads.map((load) => (
                <LaundryLoadCard load={load} showOwner key={load.id} />
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
