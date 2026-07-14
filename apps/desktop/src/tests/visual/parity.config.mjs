// Parity config — declares which views to verify and which elements to compare.
// The harness (parity.mjs) drives the design SPA via window.__setState and the
// renderer via window.__setView/__setTheme, then compares them element-by-element.
// Add a new entry here when a feature is ported; no harness changes needed.

export const viewport = { width: 1280, height: 800 };
export const designIndex = 'design/app/index.html';
export const designShotsDir = 'design/app/shots';

export const views = [
  {
    id: 'capture',
    theme: 'light',
    // state pushed to the design SPA (design/app/app.js window.__setState)
    designState: { view: 'capture', theme: 'light', sidebar: 'expanded' },
    // design baseline PNG under designShotsDir (optional; enables pixel diff)
    designShot: 'light/capture/framed.png',
    // elements compared by unique visible text (exact match) in both trees
    targets: [
      'Capture',
      'Rules & Map',
      'Composer',
      'Breakpoints',
      'Diagnostics',
      'Local traffic',
      'Settings',
      'Account',
      'api.github.com',
      '/user',
      'Recording',
    ],
  },
  // Add rules / composer / settings / breakpoints / diagnostics as they are ported.
  {
    id: 'rules',
    theme: 'light',
    designState: { view: 'rules', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/rules/framed.png',
    targets: [
      'Rules',
      'New rule',
      'Apply changes',
      'Stub /v1/user',
      'Force CORS + JSON',
      'Redirect to staging',
      'Block trackers',
      'Mock payment',
      'Match',
      'Add condition',
      'Add action',
    ],
  },
  {
    id: 'composer',
    theme: 'light',
    designState: { view: 'composer', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/composer/framed.png',
    targets: [
      'History',
      'New',
      'Send',
      'Protocol',
      'TLS 1.3 · h2',
      'authorization',
      'content-type',
      'accept',
      'Created',
      'Add header…',
    ],
  },
  {
    id: 'settings',
    theme: 'light',
    designState: { view: 'settings', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/settings/framed.png',
    targets: [
      'Root Certificate Authority',
      'Trust status',
      'HTTPS interception',
      'Generated',
      'Trusted',
      'MITM active',
      'Export',
      'Regenerate',
      'Add host',
      '1 flagged',
    ],
  },
  {
    id: 'breakpoints',
    theme: 'light',
    designState: { view: 'breakpoints', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/breakpoints/framed.png',
    targets: [
      'Debug checkout',
      'Inspect token',
      'Continue all',
      'Request paused',
      'Drop',
      'Continue unmodified',
      'Execute edited',
      'shop.example.com/checkout',
    ],
  },
  {
    id: 'diagnostics',
    theme: 'light',
    designState: { view: 'diagnostics', theme: 'light', sidebar: 'expanded' },
    designShot: 'light/diagnostics/framed.png',
    targets: [
      'core:echo',
      'rules:apply',
      'body:decode',
      'Export JSONL',
      'Action timeline',
      'received',
      'completed',
      'timed_out',
      'cancelled',
      'failed',
    ],
  },
];
