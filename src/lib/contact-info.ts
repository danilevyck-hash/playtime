import { fetchSetting } from './supabase-data';
import { CONTACT, BANK_INFO } from './constants';

export interface ContactInfo {
  whatsapp: string;
  phone: string;
  email: string;
  instagram: string;
  bank_name: string;
  bank_holder: string;
  bank_account_type: string;
  bank_account_number: string;
}

export const DEFAULT_CONTACT_INFO: ContactInfo = {
  whatsapp: CONTACT.whatsapp,
  phone: CONTACT.phone,
  email: CONTACT.email,
  instagram: CONTACT.instagram,
  bank_name: BANK_INFO.bank,
  bank_holder: BANK_INFO.name,
  bank_account_type: BANK_INFO.accountType,
  bank_account_number: BANK_INFO.accountNumber,
};

let _cached: ContactInfo | null = null;
let _fetchPromise: Promise<ContactInfo> | null = null;

export async function getContactInfo(): Promise<ContactInfo> {
  if (_cached) return _cached;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetchSetting<Partial<ContactInfo>>('contact_info')
    .then(data => {
      _cached = { ...DEFAULT_CONTACT_INFO, ...(data || {}) };
      return _cached;
    })
    .catch(() => {
      _cached = { ...DEFAULT_CONTACT_INFO };
      return _cached;
    })
    .finally(() => { _fetchPromise = null; });

  return _fetchPromise;
}
