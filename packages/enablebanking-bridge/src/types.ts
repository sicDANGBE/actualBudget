export type EnableBankingEnvironment = 'SANDBOX' | 'PRODUCTION';

export type BridgeConfig = {
  enableBankingEnvironment: EnableBankingEnvironment;
  enableBankingAppId?: string;
  enableBankingRedirectUrl: string;
  enableBankingCallbackUrl: string;
  enableBankingDataDir: string;
  enableBankingApiBaseUrl: string;
  enableBankingJwtTtlSeconds: number;
  privateKeyPath: string;
  certificatePath: string;
  databasePath: string;
  actualServerUrl?: string;
  actualPassword?: string;
  actualSessionToken?: string;
  actualBudgetId?: string;
  actualEncryptionPassword?: string;
  actualDataDir: string;
  bridgePort: number;
  bridgeBaseUrl: string;
  schedulerEnabled: boolean;
  schedulerDefaultCron: string;
};

export type BootstrapStatus = {
  dataDir: string;
  privateKeyPath: string;
  certificatePath: string;
  privateKeyExists: boolean;
  certificateExists: boolean;
  generatedPrivateKey: boolean;
  generatedCertificate: boolean;
};

export type StartAuthorizationRequest = {
  aspsp: {
    name: string;
    country: string;
  };
  validUntil?: string;
  psuType?: 'personal' | 'business';
  language?: string;
  psuId?: string;
  authMethod?: string;
  credentials?: Record<string, string>;
};

export type StartAuthorizationResponse = {
  url: string;
  authorization_id: string;
  psu_id_hash: string;
};

export type SessionResource = {
  session_id?: string;
  id?: string;
  accounts?: string[];
  access?: {
    valid_until?: string;
  };
  aspsp?: {
    name?: string;
    country?: string;
  };
  psu_type?: string;
  status?: string;
  created?: string;
  authorized?: string;
};

export type AccountDetails = {
  uid?: string;
  account_id?: Record<string, string>;
  identification_hash?: string;
  identification_hashes?: string[];
  name?: string;
  details?: string;
  currency?: string;
  product?: string;
};

export type AccountBalance = {
  name?: string;
  balance_amount?: {
    currency?: string;
    amount?: string;
  };
  balance_type?: string;
  reference_date?: string;
  last_change_date_time?: string;
};

export type EnableBankingTransaction = {
  entry_reference?: string;
  transaction_id?: string;
  proprietary_bank_transaction_code?: string;
  booking_date?: string;
  value_date?: string;
  transaction_amount?: {
    currency?: string;
    amount?: string;
  };
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string;
  status?: 'BOOK' | 'PDNG' | string;
  creditor?: { name?: string };
  debtor?: { name?: string };
  remittance_information?: string[];
  remittance_information_structured?: string[];
  additional_information?: string;
};

export type TransactionsResponse = {
  transactions?: EnableBankingTransaction[];
  booked?: EnableBankingTransaction[];
  pending?: EnableBankingTransaction[];
  continuation_key?: string;
};

export type StoredBankAccount = {
  id: string;
  sessionId: string;
  name?: string;
  currency?: string;
  identificationHash?: string;
  actualAccountId?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  rawJson?: string;
};

export type SyncResult = {
  accountId?: string;
  status: 'success' | 'skipped' | 'failed';
  imported: number;
  updated: number;
  skipped: number;
  error?: string;
};
