import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

test('Phase 2A.3 database security invariants', async (t) => {
  const url = process.env.TEST_SUPABASE_URL || '';
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY || '';
  const adminKey = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key || !adminKey) {
    t.skip('Requires isolated local Supabase test credentials.');
    return;
  }

  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `phase23-${crypto.randomUUID()}@example.com`;
  const password = `Matba5-Test-${crypto.randomUUID()}Aa9`;
  let userId = '';
  let orgId = '';

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    assert.ok(created.data.user);
    userId = created.data.user.id;

    const publicClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await publicClient.auth.signInWithPassword({ email, password });
    assert.ifError(signedIn.error);
    assert.ok(signedIn.data.session);
    const client = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const profile = await client.from('profiles').select('email').eq('id', userId).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.email, email);

    const org = await client.rpc('create_organization_atomic', {
      p_name: 'Phase 2A.3 Test',
      p_slug: `phase23-${crypto.randomUUID()}`,
      p_business_type: 'agency',
      p_billing_country_code: 'EG',
    });
    assert.ifError(org.error);
    orgId = org.data.id;

    for (const patch of [
      { plan_id: 'agency' },
      { subscription_status: 'active' },
      { created_by: crypto.randomUUID() },
    ]) {
      const result = await client.from('organizations').update(patch).eq('id', orgId);
      assert.ok(result.error, 'Organization billing/ownership fields must be protected');
    }

    const spoofInsert = await client.from('profiles').insert({
      id: userId,
      email: 'forged@example.com',
      full_name: 'Forged',
      preferred_locale: 'en',
    });
    assert.ok(spoofInsert.error, 'Profile email must not be spoofable');

    const spoofUpdate = await client.from('profiles').update({ email: 'forged@example.com' }).eq('id', userId);
    assert.ok(spoofUpdate.error, 'Profile email must not be changeable by clients');

    const usage = await client.from('usage_records').insert({
      organization_id: orgId,
      period_ym: '2099-01',
      keywords_tracked: 100000,
    });
    assert.ok(usage.error, 'Clients must not write usage counters');

    const audit = await client.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: null,
      action: 'forged',
      entity_type: 'test',
    });
    assert.ok(audit.error, 'Audit rows must have the authenticated actor');

    const project = await client.from('projects').insert({
      organization_id: orgId,
      name: 'Quota baseline',
      website_url: 'https://quota.example',
      primary_country_code: 'EG',
      created_by: userId,
    }).select('id').single();
    assert.ifError(project.error);

    const creatorChange = await client.from('projects').update({
      created_by: crypto.randomUUID(),
    }).eq('id', project.data.id);
    assert.ok(creatorChange.error, 'Project creator must be immutable');

    const readiness = await client.rpc('phase_2a3_security_perf_ready');
    assert.ifError(readiness.error);
    assert.equal(readiness.data, true);
  } finally {
    if (orgId) await admin.from('organizations').delete().eq('id', orgId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
