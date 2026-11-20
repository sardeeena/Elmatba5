export interface ServerEnvConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseConfigured: boolean;
  sessionSecret: string;
  appUrl: string;
  allowedOrigins: string[];
}

export function parseAllowedOrigins(appUrl: string, corsOriginRaw: string | undefined, isProduction: boolean): string[] {
  const origins = new Set<string>();

  if (appUrl && appUrl !== 'MY_APP_URL') {
    try {
      origins.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed non-URL placeholder
    }
  }

  if (corsOriginRaw) {
    for (const part of corsOriginRaw.split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      try {
        origins.add(new URL(trimmed).origin);
      } catch {
        // Ignore malformed entry
      }
    }
  }

  if (!isProduction) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
    origins.add('http://0.0.0.0:3000');
  }

  return Array.from(origins);
}

export function loadAndValidateEnv(envSource: NodeJS.ProcessEnv = process.env): ServerEnvConfig {
  const nodeEnv = envSource.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const port = Number(envSource.PORT ?? 3000);

  const supabaseUrl = (envSource.SUPABASE_URL ?? '').trim();
  const supabasePublishableKey = (envSource.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const sessionSecret = (envSource.SESSION_SECRET ?? '').trim();
  const appUrl = (envSource.APP_URL ?? '').trim();

  // Safety guard: never permit a Supabase secret or service_role key to be treated as a publishable key
  if (supabasePublishableKey.startsWith('sb_secret_')) {
    throw new Error(
      'Invalid configuration: SUPABASE_PUBLISHABLE_KEY appears to be a secret key. Only a Publishable key is permitted.'
    );
  }

  let validSupabaseUrl = false;
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      validSupabaseUrl = parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      validSupabaseUrl = false;
    }
  }

  const supabaseConfigured = Boolean(validSupabaseUrl && supabasePublishableKey.length > 0);

  if (isProduction) {
    if (!validSupabaseUrl) {
      throw new Error('Production startup aborted: valid SUPABASE_URL is required.');
    }
    if (!supabasePublishableKey) {
      throw new Error('Production startup aborted: SUPABASE_PUBLISHABLE_KEY is required.');
    }
    if (!sessionSecret || sessionSecret.length < 32 || sessionSecret.includes('CHANGE_ME')) {
      throw new Error(
        'Production startup aborted: SESSION_SECRET (minimum 32 random characters) is required.'
      );
    }
  }

  return {
    nodeEnv,
    isProduction,
    port,
    supabaseUrl: validSupabaseUrl ? supabaseUrl : '',
    supabasePublishableKey,
    supabaseConfigured,
    sessionSecret,
    appUrl,
    allowedOrigins: parseAllowedOrigins(appUrl, envSource.CORS_ORIGIN, isProduction),
  };
}
