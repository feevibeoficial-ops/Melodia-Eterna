import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from './app-server';

let appPromise: Promise<any> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appPromise) {
    appPromise = createApp({ serveFrontend: false });
  }

  const app = await appPromise;
  return app(req, res);
}
