import { createClient, type AuthChangeEvent, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from './types';

export interface PublicSupabaseConfig {
  configured: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

let cachedConfigPromise: Promise<PublicSupabaseConfig> | null = null;
let supabaseClientInstance: SupabaseClient | null = null;

export async function fetchPublicConfig(): Promise<PublicSupabaseConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch('/api/config/public')
      .then(async (res) => {
        if (!res.ok) {
          return { configured: false, supabaseUrl: '', supabasePublishableKey: '' };
        }
        return (await res.json()) as PublicSupabaseConfig;
      })
      .catch(() => ({ configured: false, supabaseUrl: '', supabasePublishableKey: '' }));
  }
  return cachedConfigPromise;
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabaseClientInstance) return supabaseClientInstance;
  const cfg = await fetchPublicConfig();
  if (!cfg.configured || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    return null;
  }

  supabaseClientInstance = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClientInstance;
}

export async function getAccessToken(): Promise<string | null> {
  const client = await getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signUpWithEmail(input: {
  email: string;
  password: string;
  fullName: string;
  preferredLocale: Locale;
}): Promise<{ needsEmailConfirmation: boolean; session: Session | null }> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Authentication service is not configured.');
  }

  const { data, error } = await client.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: window.location.origin,
      data: {
        full_name: input.fullName.trim(),
        preferred_locale: input.preferredLocale,
      },
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    needsEmailConfirmation: Boolean(data.user && !data.session),
    session: data.session ?? null,
  };
}

export async function signInWithEmail(input: {
  email: string;
  password: string;
}): Promise<Session> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Authentication service is not configured.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error || !data.session) {
    throw new Error(error?.message || 'Invalid email or password');
  }

  return data.session;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Authentication service is not configured.');
  }

  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/?mode=recovery`,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function updateAccountPassword(newPassword: string): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error('Authentication service is not configured.');
  }

  const { error } = await client.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutSupabase(): Promise<void> {
  const client = await getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function subscribeAuthChanges(
  handler: (event: AuthChangeEvent, session: Session | null) => void
): Promise<() => void> {
  const client = await getSupabaseClient();
  if (!client) return () => {};

  const { data } = client.auth.onAuthStateChange((event, session) => {
    handler(event, session);
  });

  return () => {
    data.subscription.unsubscribe();
  };
}
