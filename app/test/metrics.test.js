import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMetrics } from '../src/metrics.js';

test('compteur par statut et histogramme de durée', () => {
  const m = createMetrics({ version: '1.0.0', commit: 'abc' });
  m.observe({ method: 'GET', route: '/api/sites', status: 200, seconds: 0.003 });
  m.observe({ method: 'GET', route: '/api/sites', status: 200, seconds: 0.2 });
  m.observe({ method: 'GET', route: '/api/sites', status: 500, seconds: 0.004 });
  const text = m.render();
  assert.match(text, /^app_info\{version="1.0.0",commit="abc"\} 1$/m);
  assert.match(text, /^http_requests_total\{method="GET",route="\/api\/sites",status="200"\} 2$/m);
  assert.match(text, /^http_requests_total\{method="GET",route="\/api\/sites",status="500"\} 1$/m);
  assert.match(text, /^http_request_duration_seconds_bucket\{method="GET",route="\/api\/sites",le="0.005"\} 2$/m);
  assert.match(text, /^http_request_duration_seconds_bucket\{method="GET",route="\/api\/sites",le="\+Inf"\} 3$/m);
  assert.match(text, /^http_request_duration_seconds_count\{method="GET",route="\/api\/sites"\} 3$/m);
  assert.match(text, /^# TYPE http_requests_total counter$/m);
});
