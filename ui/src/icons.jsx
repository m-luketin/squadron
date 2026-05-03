// Lucide-style stroke icons. Stroke 1.6, rounded caps. currentColor.
const _ip = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

const Icon = ({ children, size = 14, className = 'tb-icon' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {..._ip} className={className}>{children}</svg>
);

const I = {
  cursor:   () => <Icon><path d="M6 4l12 6.5-5 1.5-1.5 5-5.5-13z"/></Icon>,
  spawn:    () => <Icon><circle cx="12" cy="12" r="3.5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/></Icon>,
  wall:     () => <Icon><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9h16M4 14h16M9 4v16M15 4v16"/></Icon>,
  erase:    () => <Icon><path d="M16 4l4 4-9 9-4 0 0-4 9-9z"/><path d="M3 21h12"/></Icon>,
  hex:      () => <Icon><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/></Icon>,
  settings: () => <Icon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Icon>,
  zap:      () => <Icon><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Icon>,
  alert:    () => <Icon><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h0"/></Icon>,
  plus:     () => <Icon><path d="M12 5v14M5 12h14"/></Icon>,
  arrowL:   () => <Icon><path d="M15 18l-6-6 6-6"/></Icon>,
  send:     () => <Icon><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></Icon>,
  close:    () => <Icon size={10}><path d="M18 6L6 18M6 6l12 12"/></Icon>,
  search:   () => <Icon><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>,
  zoomIn:   () => <Icon><path d="M12 6v12M6 12h12"/></Icon>,
  zoomOut:  () => <Icon><path d="M6 12h12"/></Icon>,
  fit:      () => <Icon><path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6"/></Icon>,
  file:     () => <Icon size={11}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></Icon>,
  cpu:      () => <Icon><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/></Icon>,
  graph:    () => <Icon><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M8 7l8 9M7 7l4 9M17 7l-4 9"/></Icon>,
  router:   () => <Icon><circle cx="12" cy="12" r="3.5"/><circle cx="4" cy="6" r="1.5"/><circle cx="20" cy="6" r="1.5"/><circle cx="4" cy="18" r="1.5"/><circle cx="20" cy="18" r="1.5"/><path d="M5 7l4 4M19 7l-4 4M5 17l4-4M19 17l-4-4"/></Icon>,
};

window.I = I;
window.Icon = Icon;
// Debug — confirms which icons.jsx version actually parsed and loaded.
// eslint-disable-next-line no-console
console.log('[squadron] icons loaded:', Object.keys(I).join(', '));
