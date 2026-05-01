/**
 * Onboarding URLs and human-action hints.
 *
 * Surfaced inside auth-related error envelopes so AI agents (Claude, Cursor,
 * Cline, Codex, etc.) can read a single field and tell their human exactly
 * what to do — without improvising or hallucinating URLs.
 *
 * Override at runtime via env vars to point at staging/internal hosts:
 *   COBALT_SIGNUP_URL, COBALT_KEY_URL, COBALT_DOCS_URL, COBALT_SUPPORT_EMAIL
 */
import { getRateLimits, RateLimits } from './rateLimits';

export const ONBOARDING_URLS = {
  signup: process.env.COBALT_SIGNUP_URL || 'https://app.cobaltintelligence.com/create-account',
  keys: process.env.COBALT_KEY_URL || 'https://app.cobaltintelligence.com/dashboard/quickStart',
  docs: process.env.COBALT_DOCS_URL || 'https://documentation.cobaltintelligence.com',
  support: process.env.COBALT_SUPPORT_EMAIL || 'support@cobaltintelligence.com',
};

export interface OnboardingHint {
  signup_url: string;
  key_url: string;
  docs_url: string;
  support_email: string;
  /** Multi-line, copy-pasteable instruction the agent can show its human verbatim. */
  human_action: string;
  /** Concurrency guidance — present on every onboarding hint so agents always see it. */
  rate_limits: RateLimits;
}

const stepsNoKey = (u: typeof ONBOARDING_URLS): string =>
  [
    'You need a Cobalt Intelligence API key to use this tool. Ask your human to:',
    '  1. Sign up (free trial, no card): ' + u.signup,
    '  2. Copy the API key from the dashboard: ' + u.keys,
    '  3. Save it locally with one of:',
    '       cobalt auth login --key <paste-the-key>',
    '       (or set the ' + 'COBALT_API_KEY' + ' environment variable to the key)',
    '  4. Verify with: cobalt auth status',
    'Docs: ' + u.docs,
  ].join('\n');

const stepsBadKey = (u: typeof ONBOARDING_URLS): string =>
  [
    'The configured Cobalt API key was rejected. Ask your human to:',
    '  1. Confirm the key on the dashboard: ' + u.keys,
    '  2. Re-save it: cobalt auth login --key YOUR_KEY_HERE',
    '  3. If the key looks right, contact ' + u.support + ' — the account may be suspended or out of credit.',
  ].join('\n');

export function onboardingHint(reason: 'NO_API_KEY' | 'UNAUTHORIZED'): OnboardingHint {
  const u = ONBOARDING_URLS;
  return {
    signup_url: u.signup,
    key_url: u.keys,
    docs_url: u.docs,
    support_email: u.support,
    human_action: reason === 'NO_API_KEY' ? stepsNoKey(u) : stepsBadKey(u),
    rate_limits: getRateLimits(),
  };
}
