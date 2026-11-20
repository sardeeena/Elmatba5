import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ServerEnvConfig } from './env.ts';

/**
 * Creates a stateless anonymous Supabase client using only the public URL and Publishable key.
 * Suitable strictly for public reference reads (markets, plans), contact lead submission,
 * and verifying incoming user JWTs via auth.getUser(token).
 */
export function createAnonSupabaseClient(env: ServerEnvConfig): SupabaseClient {
  if (!env.supabaseConfigured) {
    throw new Error('Supabase configuration is unavailable.');
  }

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates a request-scoped Supabase client bound to a verified user's Bearer access token.
 * Every PostgreSQL query executed through this client runs under auth.uid() with RLS enforced.
 */
export function createUserSupabaseClient(
  accessToken: string,
  env: ServerEnvConfig
): SupabaseClient {
  if (!env.supabaseConfigured) {
    throw new Error('Supabase configuration is unavailable.');
  }

  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
