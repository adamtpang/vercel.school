export const PUBLIC_HOSTS = ['vercel.school', 'www.vercel.school'];
const PUBLIC_PATHS = new Set(['/', '/index.html', '/about', '/about.html', '/contact', '/contact.html', '/privacy', '/privacy.html']);

export function startAnalytics(posthog, location, token) {
  if (!PUBLIC_HOSTS.includes(location.hostname) || !PUBLIC_PATHS.has(location.pathname) || !token) return false;
  posthog.init(token, {
    api_host: 'https://us.i.posthog.com',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-08-30',
    // Must be enabled in the project before production deployment.
    cookieless_mode: 'always',
    person_profiles: 'never',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_performance: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    before_send(event) {
      if (event.event !== '$pageview') return null;
      const props = event.properties;
      // Never transmit query strings, fragments, referrer paths, or form values.
      for (const key of Object.keys(props)) {
        if (/referr|initial|utm_|gclid|fbclid|msclkid/.test(key)) delete props[key];
      }
      props.$current_url = 'https://vercel.school' + location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/');
      props.$pathname = new URL(props.$current_url).pathname;
      props.$host = 'vercel.school';
      props.site_id = 'vercel.school';
      props.hostname = 'vercel.school';
      return event;
    },
    loaded(client) {
      // These are document navigations, not an SPA. One view per loaded page.
      client.capture('$pageview');
    }
  });
  return true;
}
