import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from './app-server';

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appPromise) {
    appPromise = createApp({ serveFrontend: false });
  }

  const app = await appPromise;
  return app(req, res);
}
