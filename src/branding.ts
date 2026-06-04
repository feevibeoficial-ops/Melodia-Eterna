export const BRANDING_ASSET_BASE = 'https://umjbcgknggmquzozkbra.supabase.co/storage/v1/object/public/site-assets/branding';

export const BRANDING = {
  logo: `${BRANDING_ASSET_BASE}/logo.png`,
  background: `${BRANDING_ASSET_BASE}/fundo.png`,
  icon: `${BRANDING_ASSET_BASE}/icon.png`,
} as const;
