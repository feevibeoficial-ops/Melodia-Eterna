import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

type PublicConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigPromise: Promise<PublicConfig> | null = null;

async function loadPublicConfig(): Promise<PublicConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetch('/api/config/public')
      .then((response) => response.json())
      .then((data) => data as PublicConfig);
  }

  return cachedConfigPromise;
}

export async function getAdminSupabaseClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = await loadPublicConfig();
  cachedClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return cachedClient;
}

export async function getAdminAccessToken() {
  const client = await getAdminSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session?.access_token || '';
}

export async function getAdminSession(): Promise<Session | null> {
  const client = await getAdminSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session;
}
