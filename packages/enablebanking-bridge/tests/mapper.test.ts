import { describe, expect, it } from 'vitest';

import {
  deterministicTransactionKey,
  importedId,
  mapEnableBankingTransaction,
} from '../src/actual/mapper.js';

describe('Enable Banking transaction mapper', () => {
  it('maps credit and debit signs to Actual integer cents', () => {
    expect(
      mapEnableBankingTransaction({
        bankAccountId: 'bank-1',
        actualAccountId: 'actual-1',
        transaction: {
          entry_reference: 'tx-1',
          booking_date: '2026-04-20',
          credit_debit_indicator: 'DBIT',
          transaction_amount: { amount: '12.34', currency: 'EUR' },
          creditor: { name: 'Coffee' },
          status: 'BOOK',
        },
      }),
    ).toMatchObject({
      account: 'actual-1',
      amount: -1234,
      imported_id: 'enablebanking:bank-1:tx-1',
      cleared: true,
    });

    expect(
      mapEnableBankingTransaction({
        bankAccountId: 'bank-1',
        actualAccountId: 'actual-1',
        transaction: {
          entry_reference: 'tx-2',
          booking_date: '2026-04-20',
          credit_debit_indicator: 'CRDT',
          transaction_amount: { amount: '12.34', currency: 'EUR' },
          debtor: { name: 'Employer' },
          status: 'PDNG',
        },
      }),
    ).toMatchObject({
      amount: 1234,
      cleared: false,
    });
  });

  it('uses a deterministic fallback imported id when bank id is absent', () => {
    const transaction = {
      booking_date: '2026-04-20',
      transaction_amount: { amount: '12.34', currency: 'EUR' },
      remittance_information: ['Invoice 42'],
    };
    expect(deterministicTransactionKey('bank-1', transaction)).toEqual(
      deterministicTransactionKey('bank-1', transaction),
    );
    expect(importedId('bank-1', transaction)).toMatch(
      /^enablebanking:bank-1:[a-f0-9]{32}$/,
    );
  });
});
