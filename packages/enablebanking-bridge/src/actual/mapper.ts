import { createHash } from 'crypto';

import type { EnableBankingTransaction } from '#types';

export type ActualImportTransaction = {
  account: string;
  date: string;
  amount: number;
  payee_name: string;
  imported_payee: string;
  imported_id: string;
  cleared: boolean;
};

function normalizeDate(value?: string): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function decimalToIntegerCents(value: string): number {
  const normalized = value.trim();
  const negative = normalized.startsWith('-');
  const unsigned = normalized.replace(/^[+-]/, '');
  const [integerPart = '0', decimalPart = ''] = unsigned.split('.');
  const cents = `${decimalPart}00`.slice(0, 2);
  const amount =
    Number.parseInt(integerPart, 10) * 100 + Number.parseInt(cents, 10);
  return negative ? -amount : amount;
}

function signedAmount(transaction: EnableBankingTransaction): number {
  const rawAmount = transaction.transaction_amount?.amount;
  if (!rawAmount) {
    return 0;
  }
  const amount = decimalToIntegerCents(rawAmount);
  if (transaction.credit_debit_indicator === 'DBIT') {
    return -Math.abs(amount);
  }
  if (transaction.credit_debit_indicator === 'CRDT') {
    return Math.abs(amount);
  }
  return amount;
}

function compactText(values: Array<string | undefined>) {
  return values
    .flatMap(value => value?.split(/\s+/) ?? [])
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function payeeName(transaction: EnableBankingTransaction): string {
  const fallback = compactText([
    ...(transaction.remittance_information ?? []),
    ...(transaction.remittance_information_structured ?? []),
    transaction.additional_information,
  ]);
  return (
    transaction.creditor?.name ??
    transaction.debtor?.name ??
    (fallback || 'Enable Banking import')
  );
}

export function deterministicTransactionKey(
  bankAccountId: string,
  transaction: EnableBankingTransaction,
): string {
  const bankIdentifier =
    transaction.entry_reference ??
    transaction.transaction_id ??
    transaction.proprietary_bank_transaction_code;
  if (bankIdentifier) {
    return bankIdentifier;
  }
  return createHash('sha256')
    .update(
      JSON.stringify({
        bankAccountId,
        date: normalizeDate(transaction.booking_date ?? transaction.value_date),
        amount: signedAmount(transaction),
        payee: payeeName(transaction),
        remittance: transaction.remittance_information ?? [],
        additional: transaction.additional_information ?? '',
      }),
    )
    .digest('hex')
    .slice(0, 32);
}

export function importedId(
  bankAccountId: string,
  transaction: EnableBankingTransaction,
): string {
  return `enablebanking:${bankAccountId}:${deterministicTransactionKey(
    bankAccountId,
    transaction,
  )}`;
}

export function mapEnableBankingTransaction(input: {
  bankAccountId: string;
  actualAccountId: string;
  transaction: EnableBankingTransaction;
}): ActualImportTransaction {
  const importedPayee = compactText([
    ...(input.transaction.remittance_information ?? []),
    ...(input.transaction.remittance_information_structured ?? []),
    input.transaction.additional_information,
  ]);
  return {
    account: input.actualAccountId,
    date: normalizeDate(
      input.transaction.booking_date ?? input.transaction.value_date,
    ),
    amount: signedAmount(input.transaction),
    payee_name: payeeName(input.transaction),
    imported_payee: importedPayee || payeeName(input.transaction),
    imported_id: importedId(input.bankAccountId, input.transaction),
    cleared: input.transaction.status !== 'PDNG',
  };
}

export function extractTransactions(response: {
  transactions?: EnableBankingTransaction[];
  booked?: EnableBankingTransaction[];
  pending?: EnableBankingTransaction[];
}) {
  const transactions = response.transactions ?? [
    ...(response.booked ?? []),
    ...(response.pending ?? []),
  ];
  const seen = new Set<string>();
  return transactions.filter(transaction => {
    const key = JSON.stringify(transaction);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
