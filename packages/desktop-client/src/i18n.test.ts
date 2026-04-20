import i18n from 'i18next';

import { availableLanguages, setI18NextLanguage } from './i18n';

vi.mock('i18next', () => {
  const resourceBundles = new Map<string, Record<string, string>>();
  let currentLanguage = 'en';
  const i18nMock = {
    use: vi.fn().mockReturnThis(),
    init: vi.fn().mockResolvedValue(undefined),
    changeLanguage: vi.fn(async (language: string) => {
      currentLanguage = language;
    }),
    addResourceBundle: vi.fn(
      (
        language: string,
        _namespace: string,
        resources: Record<string, string>,
      ) => {
        resourceBundles.set(language, resources);
      },
    ),
    hasResourceBundle: vi.fn((language: string) =>
      resourceBundles.has(language),
    ),
    t: vi.fn(
      (key: string, options?: { defaultValue?: string }) =>
        resourceBundles.get(currentLanguage)?.[key] ??
        options?.defaultValue ??
        key,
    ),
    get language() {
      return currentLanguage;
    },
  };
  return {
    default: i18nMock,
  };
});

vi.mock('./languages', () => ({
  languages: {
    '/locale/en.json': vi.fn(),
    '/locale/uk.json': vi.fn(),
    '/locale/pt-BR.json': vi.fn(),
  },
}));

vi.hoisted(vi.resetModules);

describe('setI18NextLanguage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(vi.unstubAllGlobals);

  test('should set system default language when no language is provided', async () => {
    vi.stubGlobal('navigator', { language: 'uk' });

    await setI18NextLanguage('');

    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith('uk');
  });

  test('should set the provided language if it is available', async () => {
    const language = availableLanguages[0];

    await setI18NextLanguage(language);

    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith(language);
  });

  test('should fallback to English if the provided language is unavailable', async () => {
    vi.spyOn(console, 'info');
    await setI18NextLanguage('uk');
    vi.clearAllMocks();

    await setI18NextLanguage('unknown');

    expect(console.info).toHaveBeenCalledWith(
      'Unknown locale unknown, falling back to en',
    );
    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith('en');
  });

  test('should successfully use a language with a region code if it is known', async () => {
    const language = 'pt-BR';

    await setI18NextLanguage(language);

    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith(language);
  });

  test('should fallback to base language if the provided language has an unknown region code', async () => {
    vi.spyOn(console, 'info');

    await setI18NextLanguage('uk-ZZ');

    expect(console.info).toHaveBeenCalledWith(
      'Unknown locale uk-ZZ, falling back to uk-zz',
    );
    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith('uk');
  });

  test('should fallback to lowercase language if the provided language has uppercase letters', async () => {
    vi.spyOn(console, 'info');

    await setI18NextLanguage('EN');

    expect(console.info).toHaveBeenCalledWith(
      'Unknown locale EN, falling back to en',
    );
    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith('en');
  });

  test('should use runtime French resources when locale files are absent', async () => {
    await setI18NextLanguage('fr-FR');

    expect(vi.mocked(i18n).changeLanguage).toHaveBeenCalledWith('fr-FR');
  });
});
