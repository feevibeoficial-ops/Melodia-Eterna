import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let appPromise: Promise<any> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!appPromise) {
    const { createApp } = require('../dist/server.cjs') as {
      createApp: (options: { serveFrontend?: boolean }) => Promise<any>;
    };
    appPromise = createApp({ serveFrontend: false });
  }

  const app = await appPromise;
  return app(req, res);
}
