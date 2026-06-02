import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { RespostasFormulario, PedidoMusica } from './src/types';
import { savePedido, getPedido, listPedidosByContact, listAllPedidos } from './server/db';
import { composeLyrics, refineLyrics } from './server/gemini';
import { processAudioForPedido, getAudioFilePath } from './server/audio';

function getAudioContentType(filePath: string) {
  return filePath.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
}

async function startServer() {
  const app = express();
  const port = 3000;

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.post('/api/lyrics/generate', async (req, res) => {
    try {
      const { responses, selectedGenderForRevelacao } = req.body as {
        responses: RespostasFormulario;
        selectedGenderForRevelacao?: 'menino' | 'menina';
      };

      if (!responses || !responses.respostas || !responses.temaId) {
        res.status(400).json({ error: 'Dados do formulario invalidos ou ausentes.' });
        return;
      }

      const letra = await composeLyrics(responses, selectedGenderForRevelacao);
      const pedidoId = `MEL-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      const novoPedido: PedidoMusica = {
        id: pedidoId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        cliente_email: responses.clienteEmail,
        cliente_whatsapp: responses.clienteWhatsapp,
        respostas: responses,
        letra_gerada: letra,
        letra_aprovada: null,
        termo_aceite_assinado: false,
        termo_aceite_timestamp: null,
        status_pagamento: 'PENDENTE',
        pix_copia_e_cola: null,
        pix_qr_code_url: null,
        url_original_suno: null,
        url_original_suno_2: null,
        url_local_servidor: null,
        url_local_servidor_2: null,
        data_expiracao_local: null,
      };

      savePedido(novoPedido);
      res.json(novoPedido);
    } catch (error: any) {
      console.error('Erro ao compor letra:', error);
      res.status(error?.statusCode || 500).json({
        error: error?.message || 'Erro interno do servidor ao gerar composicao.',
      });
    }
  });

  app.post('/api/lyrics/refine', async (req, res) => {
    try {
      const { id, feedback, selectedGenderForRevelacao } = req.body as {
        id: string;
        feedback: string;
        selectedGenderForRevelacao?: 'menino' | 'menina';
      };

      const pedido = getPedido(id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      const letraRefinada = await refineLyrics(
        pedido.respostas,
        pedido.letra_gerada,
        feedback,
        selectedGenderForRevelacao,
      );

      pedido.letra_gerada = letraRefinada;
      pedido.updatedAt = new Date().toISOString();
      savePedido(pedido);

      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao refinar composicao:', error);
      res.status(error?.statusCode || 500).json({
        error: error?.message || 'Erro interno ao refinar composicao.',
      });
    }
  });

  app.post('/api/lyrics/approve', async (req, res) => {
    try {
      const { id, termo_aceite_assinado } = req.body as {
        id: string;
        termo_aceite_assinado: boolean;
      };

      if (!termo_aceite_assinado) {
        res.status(400).json({ error: 'E necessario aceitar os termos de responsabilidade tecnica.' });
        return;
      }

      const pedido = getPedido(id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      const randomPixKey =
        `00020101021226850014br.gov.bcb.pix2563pix.melodiaeterna.com.br/qr/v2/${id}` +
        Math.random().toString(36).substring(2, 10).toUpperCase();

      pedido.letra_aprovada = pedido.letra_gerada;
      pedido.termo_aceite_assinado = true;
      pedido.termo_aceite_timestamp = new Date().toISOString();
      pedido.pix_copia_e_cola = randomPixKey;
      pedido.pix_qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(randomPixKey)}`;
      pedido.updatedAt = new Date().toISOString();

      const audioResults = await processAudioForPedido(
        pedido.id,
        pedido.respostas.estiloMusical,
        pedido.letra_aprovada || pedido.letra_gerada,
      );

      pedido.url_original_suno = audioResults.url_original_suno;
      pedido.url_original_suno_2 = audioResults.url_original_suno_2;
      pedido.url_local_servidor = audioResults.url_local_servidor;
      pedido.url_local_servidor_2 = audioResults.url_local_servidor_2;
      pedido.updatedAt = new Date().toISOString();

      savePedido(pedido);
      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao aprovar letra:', error);
      res.status(500).json({ error: 'Erro ao aprovar letra anterior.' });
    }
  });

  app.post('/api/dev/payment-test', async (_req, res) => {
    try {
      const pedido = listAllPedidos()[0];
      if (!pedido) {
        res.status(404).json({ error: 'Nenhum pedido encontrado para teste.' });
        return;
      }

      if (!pedido.letra_aprovada) {
        pedido.letra_aprovada = pedido.letra_gerada;
        pedido.termo_aceite_assinado = true;
        pedido.termo_aceite_timestamp = new Date().toISOString();
      }

      if (!pedido.pix_copia_e_cola) {
        const randomPixKey =
          `00020101021226850014br.gov.bcb.pix2563pix.melodiaeterna.com.br/qr/v2/${pedido.id}` +
          Math.random().toString(36).substring(2, 10).toUpperCase();
        pedido.pix_copia_e_cola = randomPixKey;
        pedido.pix_qr_code_url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(randomPixKey)}`;
      }

      if (!pedido.url_local_servidor || !pedido.url_local_servidor_2) {
        const audioResults = await processAudioForPedido(
          pedido.id,
          pedido.respostas.estiloMusical,
          pedido.letra_aprovada || pedido.letra_gerada,
        );
        pedido.url_original_suno = audioResults.url_original_suno;
        pedido.url_original_suno_2 = audioResults.url_original_suno_2;
        pedido.url_local_servidor = audioResults.url_local_servidor;
        pedido.url_local_servidor_2 = audioResults.url_local_servidor_2;
      }

      pedido.updatedAt = new Date().toISOString();
      savePedido(pedido);
      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao preparar teste de pagamento:', error);
      res.status(500).json({ error: error?.message || 'Erro ao abrir o teste de pagamento.' });
    }
  });

  app.post('/api/payment/simulate-confirm', async (req, res) => {
    try {
      const { id } = req.body as { id: string };

      const pedido = getPedido(id);
      if (!pedido) {
        res.status(404).json({ error: 'Pedido de musica nao encontrado.' });
        return;
      }

      if (pedido.status_pagamento === 'PAGO') {
        res.json(pedido);
        return;
      }

      pedido.status_pagamento = 'PAGO';
      pedido.updatedAt = new Date().toISOString();

      const expDate = new Date();
      expDate.setDate(expDate.getDate() + 7);
      pedido.data_expiracao_local = expDate.toISOString();

      savePedido(pedido);

      savePedido(pedido);
      res.json(pedido);
    } catch (error: any) {
      console.error('Erro ao simular aprovacao de audio:', error);
      res.status(500).json({ error: error?.message || 'Erro durante a geracao musical.' });
    }
  });

  app.get('/api/orders/:id', (req, res) => {
    const pedido = getPedido(req.params.id);
    if (!pedido) {
      res.status(404).json({ error: 'Musica/Pedido nao encontrado.' });
      return;
    }

    res.json(pedido);
  });

  app.post('/api/orders/search', (req, res) => {
    const { email, whatsapp } = req.body as { email: string; whatsapp: string };
    if (!email && !whatsapp) {
      res.status(400).json({ error: 'Forneca e-mail ou WhatsApp para buscar.' });
      return;
    }

    const results = listPedidosByContact(email || '', whatsapp || '');
    res.json(results);
  });

  app.get('/audio/previa/:file', (req, res) => {
    const fileName = `previa_${req.params.file}`;
    const filePath = getAudioFilePath(fileName);

    if (!filePath) {
      res.status(404).send('Arquivo de previa nao encontrado.');
      return;
    }

    res.setHeader('Content-Type', getAudioContentType(filePath));
    res.sendFile(filePath);
  });

  app.get('/audio/full/:file', (req, res) => {
    const fileParam = req.params.file;
    const orderId = fileParam.split('_')[0];
    const pedido = getPedido(orderId);

    if (!pedido || pedido.status_pagamento !== 'PAGO') {
      res.status(403).send('Acesso negado. Essa musica necessita de aprovacao de cobranca.');
      return;
    }

    const versionSuffix = fileParam.includes('_v2') ? '_v2' : '_v1';
    const filePath = getAudioFilePath(`music_${orderId}_full${versionSuffix}.mp3`);

    if (!filePath) {
      res.status(404).send('Arquivo completo de audio nao encontrado ou expirado em nosso servidor local.');
      return;
    }

    res.setHeader('Content-Type', getAudioContentType(filePath));
    res.sendFile(filePath);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Melodia Eterna Backend] Rodando com sucesso na porta: http://localhost:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Falha critica ao iniciar o servidor express full-stack:', err);
});
