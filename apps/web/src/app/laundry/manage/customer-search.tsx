'use client';

import { useActionState, useState } from 'react';

import type { LaundryMachine, LaundryOwner, LaundryTariffs } from '@/lib/api';

import {
  searchLaundryCustomersAction,
  type LaundryCustomerSearchState,
} from '../actions';
import { NewLoadForm } from './new-load-form';

const initialState: LaundryCustomerSearchState = {
  status: 'idle',
  message: '',
  customers: [],
};

export function CustomerSearch({
  machines,
  tariffs,
}: {
  machines: LaundryMachine[];
  tariffs: LaundryTariffs;
}) {
  const [state, formAction, pending] = useActionState(
    searchLaundryCustomersAction,
    initialState,
  );
  const [selectedPhone, setSelectedPhone] = useState('');
  const selectedCustomer = state.customers.find(
    (customer) => customer.phoneE164 === selectedPhone,
  );

  return (
    <section aria-labelledby="customer-search-title">
      <div className="laundry-search-heading">
        <div>
          <p className="eyebrow">Yeni yük</p>
          <h2 id="customer-search-title">Öğrenciyi telefonla bul</h2>
        </div>
        <form action={formAction} className="search-form">
          <input
            name="phone"
            type="tel"
            placeholder="+905551112233"
            autoComplete="off"
            required
          />
          <button className="primary-action" disabled={pending}>
            {pending ? 'Aranıyor…' : 'Öğrenci ara'}
          </button>
        </form>
      </div>

      {state.message ? (
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}

      {state.customers.length > 0 ? (
        <div className="laundry-customer-results">
          {state.customers.map((customer) => (
            <CustomerButton
              customer={customer}
              selected={selectedCustomer?.phoneE164 === customer.phoneE164}
              onSelect={setSelectedPhone}
              key={customer.phoneE164}
            />
          ))}
        </div>
      ) : null}

      {selectedCustomer ? (
        <NewLoadForm
          customer={selectedCustomer}
          machines={machines}
          tariffs={tariffs}
        />
      ) : null}
    </section>
  );
}

function CustomerButton({
  customer,
  selected,
  onSelect,
}: {
  customer: LaundryOwner;
  selected: boolean;
  onSelect: (phone: string) => void;
}) {
  return (
    <button
      className={selected ? 'laundry-customer-selected' : ''}
      type="button"
      onClick={() => onSelect(customer.phoneE164)}
    >
      <strong>
        {customer.firstName} {customer.lastName}
      </strong>
      <span>{customer.phoneE164}</span>
    </button>
  );
}
