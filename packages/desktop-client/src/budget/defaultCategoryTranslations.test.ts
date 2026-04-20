import i18n from 'i18next';
import { afterEach, describe, expect, it } from 'vitest';

import { translateDefaultCategories } from './defaultCategoryTranslations';

describe('defaultCategoryTranslations', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('translates default groups and categories in French', async () => {
    await i18n.changeLanguage('fr');

    const categories = translateDefaultCategories({
      list: [
        {
          id: 'cat-1',
          name: 'Salary',
          group: 'group-1',
          hidden: false,
          is_income: true,
        },
        {
          id: 'cat-2',
          name: 'Starting Balances',
          group: 'group-1',
          hidden: false,
          is_income: true,
        },
      ],
      grouped: [
        {
          id: 'group-1',
          name: 'Income',
          hidden: false,
          categories: [
            {
              id: 'cat-1',
              name: 'Salary',
              group: 'group-1',
              hidden: false,
              is_income: true,
            },
          ],
        },
      ],
    });

    expect(categories.grouped[0].name).toBe('Revenus');
    expect(categories.grouped[0].categories?.[0].name).toBe('Salaire');
    expect(categories.list[1].name).toBe('Solde initial');
  });

  it('keeps names unchanged outside translated defaults', async () => {
    await i18n.changeLanguage('fr');

    const categories = translateDefaultCategories({
      list: [
        {
          id: 'cat-1',
          name: 'Perso',
          group: 'group-1',
          hidden: false,
          is_income: false,
        },
      ],
      grouped: [
        {
          id: 'group-1',
          name: 'Custom Group',
          hidden: false,
          categories: [],
        },
      ],
    });

    expect(categories.grouped[0].name).toBe('Custom Group');
    expect(categories.list[0].name).toBe('Perso');
  });
});
