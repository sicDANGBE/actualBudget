import type {
  CategoryEntity,
  CategoryGroupEntity,
} from '@actual-app/core/types/models';
import i18n from 'i18next';

type CategoryViews = {
  grouped: CategoryGroupEntity[];
  list: CategoryEntity[];
};

const defaultCategoryTranslationsFr: Record<string, string> = {
  Income: 'Revenus',
  Salary: 'Salaire',
  'Secondary Salary': 'Revenus complémentaires',
  Bonuses: 'Primes',
  'Freelance / Side Business': 'Activité indépendante',
  'Aid / Reimbursements': 'Aides / remboursements',
  'Starting Balances': 'Solde initial',
  Housing: 'Logement',
  'Rent / Mortgage': 'Loyer / crédit immobilier',
  Electricity: 'Électricité',
  'Electricity / Gas': 'Électricité / gaz / chauffage',
  'Gas / Heating': 'Gaz / chauffage',
  Water: 'Eau',
  'Internet / Fiber': 'Internet',
  'Home Insurance': 'Assurance habitation',
  'Housing Tax / Property Tax': 'Taxes logement',
  'Housing Charges': 'Charges logement',
  'Fixed Expenses': 'Factures & contrats',
  Phone: 'Téléphone',
  'Health Insurance / Mutual': 'Mutuelle',
  'Other Insurance': 'Assurances',
  'Loan Payments': 'Crédits',
  'Essential Subscriptions': 'Abonnements essentiels',
  Transport: 'Déplacements',
  Fuel: 'Carburant',
  'Vehicle Maintenance': 'Entretien véhicule',
  'Car Insurance': 'Assurance auto',
  'Parking / Tolls': 'Parking / péages',
  'Public Transport': 'Transports en commun',
  'Daily Life': 'Vie courante',
  Groceries: 'Courses alimentaires',
  'Restaurants / Eating Out': "Restaurants / repas à l'extérieur",
  'Hygiene / Pharmacy': 'Hygiène / pharmacie',
  Clothing: 'Vêtements',
  'Home / Small Purchases': 'Maison / petits achats',
  'Leisure & Personal': 'Loisirs',
  'Going Out': 'Sorties',
  'Streaming / Entertainment Subscriptions': 'Streaming / abonnements loisirs',
  'Hobbies / Games': 'Loisirs / jeux',
  Holidays: 'Vacances',
  Gifts: 'Cadeaux',
  Health: 'Santé',
  Doctor: 'Médecin',
  Specialists: 'Spécialistes',
  Medication: 'Médicaments',
  'Optical / Dental': 'Optique / dentaire',
  Pets: 'Animaux',
  'Pet Food': 'Nourriture',
  Vet: 'Vétérinaire',
  'Pet Insurance': 'Assurance animaux',
  'Pet Accessories': 'Accessoires',
  'Savings & Investments': 'Épargne',
  'Emergency Fund': 'Épargne de précaution',
  'Project Savings': 'Épargne projets',
  Investments: 'Investissements',
  'Retirement / Long Term': 'Retraite / long terme',
  'Projects & Exceptional': 'Projets & dépenses exceptionnelles',
  'IT / Equipment': 'Informatique / équipement',
  'Home Improvement / Furniture': 'Meubles / aménagement',
  'Home Maintenance': 'Travaux / entretien',
  'Exceptional Expenses': 'Dépenses exceptionnelles',
  'Training / Learning': 'Formation',
  Business: 'Activité professionnelle',
  'Hosting / Cloud': 'Hébergement / cloud',
  'SaaS Tools': 'Outils SaaS',
  'Professional Equipment': 'Matériel professionnel',
  'Banking / Accounting': 'Banque / comptabilité',
  'Marketing / Communication': 'Marketing / communication',
  Unexpected: 'Imprévus',
  Emergencies: 'Urgences',
  'Unplanned Expenses': 'Dépenses non prévues',
};

const translatableDefaultCategoryNames = new Set(
  Object.keys(defaultCategoryTranslationsFr),
);

let hasRegisteredDefaultCategoryTranslations = false;

export function isDefaultCategoryLanguageSupported(language: string): boolean {
  return language.toLowerCase().split('-')[0] === 'fr';
}

export function registerDefaultCategoryTranslations() {
  if (hasRegisteredDefaultCategoryTranslations) {
    return;
  }

  if (typeof i18n.addResourceBundle === 'function') {
    i18n.addResourceBundle(
      'fr',
      'translation',
      defaultCategoryTranslationsFr,
      true,
      true,
    );
  }

  hasRegisteredDefaultCategoryTranslations = true;
}

export function translateDefaultCategoryName(name: string): string;
export function translateDefaultCategoryName(
  name: null | undefined,
): null | undefined;
export function translateDefaultCategoryName(name: string | null | undefined) {
  registerDefaultCategoryTranslations();

  if (!name || !translatableDefaultCategoryNames.has(name)) {
    return name;
  }

  if (isDefaultCategoryLanguageSupported(i18n.language ?? '')) {
    return defaultCategoryTranslationsFr[name];
  }

  return i18n.t(name, { defaultValue: name });
}

export function translateDefaultCategory(
  category: CategoryEntity,
): CategoryEntity {
  return {
    ...category,
    name: translateDefaultCategoryName(category.name),
  };
}

export function translateDefaultCategoryGroup(
  categoryGroup: CategoryGroupEntity,
): CategoryGroupEntity {
  return {
    ...categoryGroup,
    name: translateDefaultCategoryName(categoryGroup.name),
    categories: categoryGroup.categories?.map(category =>
      translateDefaultCategory(category),
    ),
  };
}

export function translateDefaultCategories(
  categories: CategoryViews,
): CategoryViews {
  registerDefaultCategoryTranslations();

  return {
    list: categories.list.map(category => translateDefaultCategory(category)),
    grouped: categories.grouped.map(categoryGroup =>
      translateDefaultCategoryGroup(categoryGroup),
    ),
  };
}
