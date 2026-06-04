import type { VercelRequest, VercelResponse } from '@vercel/node';

let appPromise: Promise<any> | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!appPromise) {
      const { createApp } = await import('./app-server');
      appPromise = createApp({ serveFrontend: false });
    }

    const app = await appPromise;
    return app(req, res);
  } catch (error: any) {
    console.error('Falha ao inicializar API da Vercel:', error);
    res.status(500).json({
      error: 'Falha ao inicializar API da Vercel.',
      message: error?.message || 'Erro desconhecido.',
      stack: process.env.NODE_ENV !== 'production' ? error?.stack || null : null,
    });
  }
}
