// client/src/app/people.js — Person 1
// Small helpers for showing people: initials, role names, status colours and words.

import { ROLES, STATUSES } from '@shared/constants.js';

/** 'Riya Sharma' → 'RS';  'Admin (Infotact)' → 'AI';  '' → '?' */
export function initialsOf(name) {
  const words = String(name || '')
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin',
  [ROLES.DIRECTOR]: 'Director',
  [ROLES.LEAD]: 'Team lead',
  [ROLES.EMPLOYEE]: 'Employee',
  [ROLES.INTERN]: 'Intern',
};

/** 'lead' → 'Team lead' */
export function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

// Each status: its dot colour, its words, and a one-line explanation for the menu.
export const STATUS_INFO = Object.freeze({
  [STATUSES.AVAILABLE]: { color: '#1fa971', label: 'Available', hint: 'People near you can talk to you.' },
  [STATUSES.BUSY]: { color: '#e0a100', label: 'Busy', hint: 'Still reachable; shows you are focused.' },
  [STATUSES.DND]: { color: '#d64545', label: 'Do Not Disturb', hint: 'Nobody hears you and you hear nobody.' },
});

/** The colour of a status dot; unknown statuses count as available. */
export function statusColor(status) {
  return (STATUS_INFO[status] || STATUS_INFO[STATUSES.AVAILABLE]).color;
}
