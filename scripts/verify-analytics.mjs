import assert from 'node:assert/strict';
import { startAnalytics } from '../analytics.mjs';

let options, views = 0;
const client = { init(key, config) { options = config; config.loaded(this); }, capture(event) { assert.equal(event, '$pageview'); views++; } };
for (const host of ['localhost', 'preview.vercel.app', 'evil.vercel.school']) {
  assert.equal(startAnalytics(client, { hostname: host, pathname: '/' }, 'phc_test'), false);
}
assert.equal(startAnalytics(client, { hostname: 'vercel.school', pathname: '/private' }, 'phc_test'), false);
assert.equal(startAnalytics(client, { hostname: 'vercel.school', pathname: '/' }, ''), false);
assert.equal(views, 0);
assert.equal(startAnalytics(client, { hostname: 'www.vercel.school', pathname: '/about.html' }, 'phc_test'), true);
assert.equal(views, 1);
assert.equal(options.autocapture, false);
assert.equal(options.disable_session_recording, true);
assert.equal(options.cookieless_mode, 'always');
const result = options.before_send({ event: '$pageview', properties: { $current_url: 'https://www.vercel.school/about.html?email=private#secret', $referrer: 'https://example.com/private', $initial_current_url: 'private', utm_source: 'private' } });
assert.deepEqual(result.properties, { $current_url: 'https://vercel.school/about', $pathname: '/about', $host: 'vercel.school', site_id: 'vercel.school', hostname: 'vercel.school' });
assert.equal(options.before_send({ event: '$autocapture', properties: {} }), null);
console.log('Analytics: production route allowlist, disabled state, one pageview, canonical identity, URL privacy and replay/autocapture exclusions passed.');
