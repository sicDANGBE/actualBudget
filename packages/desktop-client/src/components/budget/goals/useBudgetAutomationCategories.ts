import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useCategories } from '#hooks/useCategories';

export function useBudgetAutomationCategories() {
  const { t } = useTranslation();
  const { data: { grouped } = { grouped: [] } } = useCategories();
  const categories = useMemo(() => {
    const incomeGroup = grouped.find(group => group.is_income);

    return [
      {
        id: '',
        name: t('Special categories'),
        categories: [
          { id: 'total', group: '', name: t('Total of all income') },
          {
            id: 'to-budget',
            group: '',
            name: t('Available funds to budget'),
          },
        ],
      },
      ...(incomeGroup
        ? [{ ...incomeGroup, name: t('Income categories') }]
        : []),
    ];
  }, [grouped, t]);

  return categories;
}
