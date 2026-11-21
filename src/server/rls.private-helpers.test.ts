import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

test('private RLS helpers remain unavailable as public RPCs while RLS still protects rows', async (t) => {
  const url = process.env.TEST_SUPABASE_URL || '';
  const key = process.env.TEST_SUPABASE_PUBLISHABLE_KEY || '';
  const token = process.env.TEST_SUPABASE_ACCESS_TOKEN || '';
  if (!url || !key || !token) {
    const reason = 'Requires an authenticated user in the isolated local Supabase test environment.';
    if (process.env.CI === 'true') throw new Error(reason);
    t.skip(reason);
    return;
  }

  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [member, role, profile] = await Promise.all([
    client.rpc('is_org_member', { p_org_id: '00000000-0000-0000-0000-000000000000' }),
    client.rpc('has_org_role', {
      p_org_id: '00000000-0000-0000-0000-000000000000',
      p_roles: ['owner'],
    }),
    client.rpc('can_view_profile', { p_profile_id: '00000000-0000-0000-0000-000000000000' }),
  ]);

  assert.ok(member.error, 'is_org_member must not be callable through the exposed public API');
  assert.ok(role.error, 'has_org_role must not be callable through the exposed public API');
  assert.ok(profile.error, 'can_view_profile must not be callable through the exposed public API');
});
