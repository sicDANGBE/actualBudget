// @ts-strict-ignore
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { FormError } from '@actual-app/components/form-error';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { InlineField } from '@actual-app/components/inline-field';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import type { ParseFileOptions } from '@actual-app/core/server/transactions/import/parse-file';
import { amountToInteger, toRelaxedNumber } from '@actual-app/core/shared/util';
import type {
  CategoryEntity,
  ImportTransactionEntity,
} from '@actual-app/core/types/models';

import { useCreateAccountMutation } from '#accounts';
import { Link } from '#components/common/Link';
import {
  Modal,
  ModalButtons,
  ModalCloseButton,
  ModalHeader,
  ModalTitle,
} from '#components/common/Modal';
import { Checkbox } from '#components/forms';
import { validateAccountName } from '#components/util/accountValidation';
import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { useNavigate } from '#hooks/useNavigate';
import { closeModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

import {
  applyFieldMappings,
  isDateFormat,
  parseAmountFields,
  parseDate,
} from './ImportTransactionsModal/utils';
import type {
  DateFormat,
  FieldMapping,
  ImportTransaction,
} from './ImportTransactionsModal/utils';

type ParsedImportFile = {
  filename: string;
  importedBalance: number | null;
  importedTransactions: Array<Omit<ImportTransactionEntity, 'account'>>;
};

type Translate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

export function CreateLocalAccountModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { data: accounts = [] } = useAccounts();
  const { data: { list: categories = [] } = { list: [] } } = useCategories();
  const [name, setName] = useState('');
  const [offbudget, setOffbudget] = useState(false);
  const [balance, setBalance] = useState('0');
  const [selectedImportFileName, setSelectedImportFileName] = useState<
    string | null
  >(null);
  const [parsedImportFile, setParsedImportFile] =
    useState<ParsedImportFile | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsingImportFile, setIsParsingImportFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  const validateBalance = (value: string) => !isNaN(parseFloat(value));

  const validateAndSetName = (nextName: string) => {
    const nextNameError = validateAccountName(nextName, '', accounts);
    if (nextNameError) {
      setNameError(nextNameError);
    } else {
      setName(nextName);
      setNameError(null);
    }
  };

  const createAccount = useCreateAccountMutation();
  const shouldUseImportedBalance =
    parsedImportFile != null && parsedImportFile.importedBalance != null;

  async function onSelectImportFile() {
    const res = await window.Actual.openFileDialog({
      filters: [
        {
          name: t('Financial files'),
          extensions: ['qif', 'ofx', 'qfx', 'csv', 'tsv', 'xml'],
        },
      ],
    });

    if (!res?.[0]) {
      return;
    }

    setSelectedImportFileName(getImportedFileName(res[0]));
    setIsParsingImportFile(true);
    setImportError(null);

    try {
      const nextParsedFile = await parseImportedTransactionsFile(
        res[0],
        categories,
        t,
      );
      setParsedImportFile(nextParsedFile);
    } catch (error) {
      setParsedImportFile(null);
      setImportError(
        error instanceof Error
          ? error.message
          : t('There was an error parsing the import file.'),
      );
    } finally {
      setIsParsingImportFile(false);
    }
  }

  function onRemoveImportFile() {
    setSelectedImportFileName(null);
    setParsedImportFile(null);
    setImportError(null);
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextNameError = validateAccountName(name, '', accounts);
    setNameError(nextNameError);

    const nextBalanceError =
      !shouldUseImportedBalance && !validateBalance(balance);
    setBalanceError(nextBalanceError);

    if (nextNameError || nextBalanceError || importError) {
      return;
    }

    setIsSubmitting(true);

    try {
      const id = await createAccount.mutateAsync(
        parsedImportFile
          ? {
              name,
              balance: 0,
              importedBalance:
                parsedImportFile.importedBalance ?? toRelaxedNumber(balance),
              importedTransactions: parsedImportFile.importedTransactions,
              offBudget: offbudget,
            }
          : {
              name,
              balance: toRelaxedNumber(balance),
              offBudget: offbudget,
            },
      );

      dispatch(closeModal());
      void navigate('/accounts/' + id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal name="add-local-account">
      {({ state }) => (
        <>
          <ModalHeader
            title={
              <ModalTitle title={t('Create Local Account')} shrinkOnOverflow />
            }
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <View>
            <Form onSubmit={onSubmit}>
              <InlineField label={t('Name')} width="100%">
                <InitialFocus>
                  <Input
                    name="name"
                    value={name}
                    onChangeValue={setName}
                    onUpdate={value => {
                      validateAndSetName(value.trim());
                    }}
                    style={{ flex: 1 }}
                  />
                </InitialFocus>
              </InlineField>
              {nameError && (
                <FormError style={{ marginLeft: 75, color: theme.warningText }}>
                  {nameError}
                </FormError>
              )}

              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                <View style={{ flexDirection: 'column' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <Checkbox
                      id="offbudget"
                      name="offbudget"
                      checked={offbudget}
                      onChange={() => setOffbudget(!offbudget)}
                    />
                    <label
                      htmlFor="offbudget"
                      style={{
                        userSelect: 'none',
                        verticalAlign: 'center',
                      }}
                    >
                      <Trans>Off budget</Trans>
                    </label>
                  </View>
                  <div
                    style={{
                      textAlign: 'right',
                      fontSize: '0.7em',
                      color: theme.pageTextLight,
                      marginTop: 3,
                    }}
                  >
                    <Text>
                      <Trans>
                        This cannot be changed later. See{' '}
                        <Link
                          variant="external"
                          linkColor="muted"
                          to="https://actualbudget.org/docs/accounts/#off-budget-accounts"
                        >
                          Accounts Overview
                        </Link>{' '}
                        for more information.
                      </Trans>
                    </Text>
                  </div>
                </View>
              </View>

              <InlineField label={t('Import file')} width="100%">
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 5,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <ButtonWithLoading
                      isLoading={isParsingImportFile}
                      onPress={onSelectImportFile}
                    >
                      <Trans>Select file...</Trans>
                    </ButtonWithLoading>
                    {(parsedImportFile ||
                      selectedImportFileName ||
                      importError) && (
                      <Button onPress={onRemoveImportFile}>
                        <Trans>Remove</Trans>
                      </Button>
                    )}
                  </View>

                  <Text style={{ color: theme.pageTextLight }}>
                    {selectedImportFileName
                      ? selectedImportFileName
                      : t(
                          'Optional. Import a QIF, OFX, QFX, CSV, TSV, or XML bank file.',
                        )}
                  </Text>

                  {parsedImportFile && shouldUseImportedBalance && (
                    <Text style={{ color: theme.pageTextLight }}>
                      <Trans>
                        The imported file provides an account balance, which
                        will be used to initialize the account.
                      </Trans>
                    </Text>
                  )}

                  {parsedImportFile && !shouldUseImportedBalance && (
                    <Text style={{ color: theme.pageTextLight }}>
                      <Trans>
                        This balance will be used to compute the account
                        starting balance from the imported transactions.
                      </Trans>
                    </Text>
                  )}
                </View>
              </InlineField>
              {importError && (
                <FormError style={{ marginLeft: 75 }}>{importError}</FormError>
              )}

              {!shouldUseImportedBalance && (
                <>
                  <InlineField
                    label={
                      parsedImportFile
                        ? t('Current account balance')
                        : t('Balance')
                    }
                    width="100%"
                  >
                    <Input
                      name="balance"
                      inputMode="decimal"
                      value={balance}
                      onChangeValue={setBalance}
                      onUpdate={value => {
                        const nextBalance = value.trim();
                        setBalance(nextBalance);
                        if (validateBalance(nextBalance) && balanceError) {
                          setBalanceError(false);
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                  </InlineField>
                  {balanceError && (
                    <FormError style={{ marginLeft: 75 }}>
                      <Trans>Balance must be a number</Trans>
                    </FormError>
                  )}
                </>
              )}

              <ModalButtons>
                <Button onPress={() => state.close()}>
                  <Trans>Back</Trans>
                </Button>
                <ButtonWithLoading
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  style={{ marginLeft: 10 }}
                >
                  <Trans>Create</Trans>
                </ButtonWithLoading>
              </ModalButtons>
            </Form>
          </View>
        </>
      )}
    </Modal>
  );
}

function getImportedFileType(filepath: string): string {
  const match = filepath.match(/\.([^.]*)$/);
  if (!match) {
    return 'ofx';
  }

  const extension = match[1].toLowerCase();
  return extension === 'tsv' ? 'csv' : extension;
}

function getImportedFileName(filepath: string): string {
  return filepath.split(/[/\\]/).pop() || filepath;
}

function isOfxImportFile(fileType: string) {
  return fileType === 'ofx' || fileType === 'qfx';
}

function isCamtImportFile(fileType: string) {
  return fileType === 'xml';
}

function getImportParseOptions(fileType: string): ParseFileOptions {
  if (fileType === 'csv') {
    return {};
  }

  if (isOfxImportFile(fileType)) {
    return {
      fallbackMissingPayeeToMemo: true,
      importNotes: true,
      swapPayeeAndMemo: false,
    };
  }

  if (fileType === 'qif' || isCamtImportFile(fileType)) {
    return {
      importNotes: true,
      swapPayeeAndMemo: false,
    };
  }

  return { importNotes: true };
}

function getInitialDateFormat(
  transactions: ImportTransaction[],
  mappings: FieldMapping,
): DateFormat {
  if (transactions.length === 0 || mappings.date == null) {
    return 'yyyy mm dd';
  }

  const transaction = transactions[0];
  const date = transaction[mappings.date];
  const found =
    date == null || typeof date === 'boolean'
      ? null
      : (
          [
            'yyyy mm dd',
            'yy mm dd',
            'mm dd yyyy',
            'mm dd yy',
            'dd mm yyyy',
            'dd mm yy',
          ] as DateFormat[]
        ).find(format => parseDate(date, format) != null);

  return found ?? 'mm dd yyyy';
}

function getInitialMappings(transactions: ImportTransaction[]): FieldMapping {
  if (transactions.length === 0) {
    return {
      amount: null,
      category: null,
      date: null,
      inOut: null,
      inflow: null,
      notes: null,
      outflow: null,
      payee: null,
    };
  }

  const transaction = transactions[0];
  const fields = Object.entries(transaction);

  function key(entry: [string, unknown] | undefined) {
    return entry ? entry[0] : null;
  }

  const dateField = key(
    fields.find(([fieldName]) => fieldName.toLowerCase().includes('date')) ||
      fields.find(([, value]) => String(value)?.match(/^\d+[-/]\d+[-/]\d+$/)),
  );
  const amountField = key(
    fields.find(([fieldName]) => fieldName.toLowerCase().includes('amount')) ||
      fields.find(([, value]) => String(value)?.match(/^-?[.,\d]+$/)),
  );
  const categoryField = key(
    fields.find(([fieldName]) => fieldName.toLowerCase().includes('category')),
  );
  const payeeField = key(
    fields.find(([fieldName]) => fieldName.toLowerCase().includes('payee')) ||
      fields.find(
        ([fieldName]) =>
          fieldName !== dateField &&
          fieldName !== amountField &&
          fieldName !== categoryField,
      ),
  );
  const notesField = key(
    fields.find(([fieldName]) => fieldName.toLowerCase().includes('notes')) ||
      fields.find(
        ([fieldName]) =>
          fieldName !== dateField &&
          fieldName !== amountField &&
          fieldName !== categoryField &&
          fieldName !== payeeField,
      ),
  );
  const inOutField = key(
    fields.find(
      ([fieldName]) =>
        fieldName !== dateField &&
        fieldName !== amountField &&
        fieldName !== payeeField &&
        fieldName !== notesField,
    ),
  );

  return {
    amount: amountField,
    category: categoryField,
    date: dateField,
    inOut: inOutField,
    inflow: null,
    notes: notesField,
    outflow: null,
    payee: payeeField,
  };
}

function parseCategoryField(
  importedCategory: string | undefined,
  categories: CategoryEntity[],
) {
  if (!importedCategory) {
    return null;
  }

  const matchingCategory = categories.find(
    category => category.name === importedCategory,
  );
  return matchingCategory?.id ?? null;
}

async function parseImportedTransactionsFile(
  filepath: string,
  categories: CategoryEntity[],
  t: Translate,
): Promise<ParsedImportFile> {
  const fileType = getImportedFileType(filepath);
  const {
    balance,
    errors,
    transactions: parsedTransactions = [],
  } = await send('transactions-parse-file', {
    filepath,
    options: getImportParseOptions(fileType),
  });

  if (errors.length > 0) {
    throw new Error(errors[0].message || t('Failed importing file'));
  }

  const importTransactions = parsedTransactions as ImportTransaction[];
  const fieldMappings =
    fileType === 'csv' ? getInitialMappings(importTransactions) : null;

  let parseDateFormat: DateFormat | null = null;
  if (fileType === 'csv') {
    const initialDateFormat = getInitialDateFormat(
      importTransactions,
      fieldMappings,
    );
    parseDateFormat = isDateFormat(initialDateFormat)
      ? initialDateFormat
      : null;
  } else if (fileType === 'qif') {
    const initialDateFormat = getInitialDateFormat(importTransactions, {
      amount: null,
      category: null,
      date: 'date',
      inOut: null,
      inflow: null,
      notes: null,
      outflow: null,
      payee: null,
    });
    parseDateFormat = isDateFormat(initialDateFormat)
      ? initialDateFormat
      : null;
  }

  const importedTransactions = importTransactions.map(transaction => {
    const mappedTransaction = fieldMappings
      ? applyFieldMappings(transaction, fieldMappings)
      : transaction;
    const date =
      isOfxImportFile(fileType) || isCamtImportFile(fileType)
        ? mappedTransaction.date
        : parseDate(mappedTransaction.date, parseDateFormat);

    if (date == null) {
      throw new Error(
        t('Unable to parse date {{date}} with given date format', {
          date:
            typeof mappedTransaction.date === 'string'
              ? mappedTransaction.date
              : t('(empty)'),
        }),
      );
    }

    const { amount } = parseAmountFields(
      mappedTransaction,
      false,
      false,
      '',
      false,
      '',
    );

    if (amount == null) {
      throw new Error(
        t('Transaction on {{date}} has no amount', {
          date:
            typeof mappedTransaction.date === 'string'
              ? mappedTransaction.date
              : date,
        }),
      );
    }

    return {
      amount: amountToInteger(amount),
      category:
        parseCategoryField(mappedTransaction.category, categories) ?? undefined,
      cleared: true,
      date,
      imported_id:
        typeof mappedTransaction.imported_id === 'string'
          ? mappedTransaction.imported_id
          : undefined,
      imported_payee:
        typeof mappedTransaction.imported_payee === 'string'
          ? mappedTransaction.imported_payee
          : undefined,
      notes:
        typeof mappedTransaction.notes === 'string'
          ? mappedTransaction.notes
          : null,
      payee_name:
        typeof mappedTransaction.payee_name === 'string'
          ? mappedTransaction.payee_name
          : undefined,
    };
  });

  return {
    filename: getImportedFileName(filepath),
    importedBalance: typeof balance === 'number' ? balance : null,
    importedTransactions,
  };
}
