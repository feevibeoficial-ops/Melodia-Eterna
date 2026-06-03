# Melodia Eterna

Aplicacao web para coleta de briefing, geracao de letra personalizada, aprovacao do cliente, envio da letra para producao manual e entrega de duas faixas com previa e liberacao manual apos pagamento.

## Fluxo atual

1. O cliente escolhe um tema e responde o formulario.
2. O sistema gera a letra.
3. O cliente revisa e aprova a letra.
4. Ao aprovar, o sistema:
   - salva o pedido
   - gera o PIX
   - tenta enviar a letra automaticamente para o Telegram do estudio
   - opcionalmente abre o WhatsApp do estudio
5. O estudio produz a musica manualmente fora do app.
6. Na area de gestao, o estudio sobe as duas faixas.
7. O sistema gera as previas e mostra ao cliente.
8. O cliente envia o comprovante.
9. O estudio marca o pedido como pago.
10. O download completo fica liberado por 10 dias.

## Requisitos

- Node.js 18+
- npm
- Chave do Gemini

Opcional:
- Telegram Bot para notificacao automatica da letra aprovada
- FFmpeg manual nao e mais necessario para o fluxo padrao de MP3, porque o projeto usa `ffmpeg-static`

Observacao:
- WAV continua funcionando normalmente
- MP3 agora usa o `ffmpeg-static` empacotado no projeto para gerar a previa

## Instalacao

```powershell
npm install
```

## Variaveis de ambiente

Crie ou ajuste o arquivo [`.env.local`](C:/APPs/Melodia%20Eterna/.env.local:1):

```env
GEMINI_API_KEY="sua_chave_gemini"
ADMIN_PASSWORD="sua_senha_da_gestao"
APP_WHATSAPP_NUMBER="5568999999999"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
```

Para rodar em Vercel com persistencia fora do filesystem local, configure tambem:

```env
SUPABASE_URL="https://seu-projeto.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="sua_service_role_key"
SUPABASE_ORDERS_TABLE="pedidos"
STORAGE_PROVIDER="supabase"
SUPABASE_AUDIO_BUCKET="audios"
SUPABASE_PROOFS_BUCKET="comprovantes"
TELEGRAM_WEBHOOK_SECRET="um_segredo_longo"
APP_URL="https://seu-dominio.vercel.app"
```

## Como rodar

Modo desenvolvimento:

```powershell
npm run dev
```

Build de producao:

```powershell
npm run build
npm start
```

## Telegram automatico

Quando a letra e aprovada, o backend pode te mandar automaticamente a letra no Telegram.

### 1. Criar o bot

1. Abra o Telegram.
2. Procure por [@BotFather](https://t.me/BotFather).
3. Envie o comando `/newbot`.
4. Defina um nome para o bot.
5. Defina um username terminado em `bot`.
6. Copie o token gerado.

Referencia oficial:
- [Bots: An introduction for developers](https://core.telegram.org/bots)
- [BotFather / newbot](https://core.telegram.org/bots/features)

### 2. Falar com o bot

1. Abra o bot criado.
2. Clique em `Start` ou envie qualquer mensagem.

Isso e necessario para o bot conseguir ter uma conversa com voce.

### 3. Descobrir o chat id

Com o bot ja iniciado, abra no navegador:

```text
https://api.telegram.org/botSEU_TOKEN/getUpdates
```

Procure no JSON retornado pelo campo `chat.id`.

Referencia oficial:
- [Telegram Bot API](https://core.telegram.org/bots/api/)

### 4. Configurar no projeto

Preencha no [`.env.local`](C:/APPs/Melodia%20Eterna/.env.local:1):

```env
TELEGRAM_BOT_TOKEN="seu_token"
TELEGRAM_CHAT_ID="seu_chat_id"
```

Depois reinicie o servidor:

```powershell
npm run dev
```

### 5. Testar

1. Gere uma letra no app.
2. Aprove a letra.
3. O backend vai tentar enviar automaticamente a letra aprovada para o seu Telegram.

Se o Telegram nao estiver configurado, o sistema continua funcionando normalmente.

### Webhook do Telegram para Vercel

Em ambiente serverless, use webhook em vez de polling. Com `TELEGRAM_WEBHOOK_SECRET` configurado, o servidor nao inicia polling e passa a aceitar updates em:

```text
https://seu-dominio.vercel.app/api/telegram/webhook/SEU_SEGREDO
```

Configure o webhook no Telegram:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://api.telegram.org/botSEU_TOKEN/setWebhook" `
  -ContentType "application/json" `
  -Body '{"url":"https://seu-dominio.vercel.app/api/telegram/webhook/SEU_SEGREDO"}'
```

Para desenvolvimento local sem `TELEGRAM_WEBHOOK_SECRET`, o polling continua disponivel.

## Gestao

A gestao fica dentro do proprio app.

Funcionalidades:
- login com senha
- listar pedidos
- anexar duas faixas por pedido
- salvar URL de referencia das faixas
- marcar como pago
- marcar como nao pago
- limpar faixas

Senha usada:
- `ADMIN_PASSWORD`

## Upload de audio

No modo local, os arquivos de cada pedido ficam organizados em:

```text
data/audio/<ID_DO_PEDIDO>/
```

Exemplo:

```text
data/audio/MEL-ABC123XYZ/
```

Arquivos tipicos:
- `music_full_v1.wav`
- `music_full_v2.wav`
- `previa_v1.wav`
- `previa_v2.wav`

No modo Vercel/Supabase, os arquivos finais e as previas ficam no bucket privado `audios`.

## Armazenamento dos pedidos

No modo local, os pedidos ficam em:

```text
data/pedidos/
```

Cada pedido e salvo em JSON.

No modo Vercel/Supabase, os pedidos ficam na tabela `public.pedidos`, com o objeto completo em `data jsonb`.

## Supabase

A migracao esta em:

```text
supabase/migrations/20260602100000_create_pedidos_storage.sql
```

Ela cria:
- tabela `public.pedidos`
- bucket privado `audios`
- bucket privado `comprovantes`
- policies para acesso via `service_role`

Depois de aplicar a migracao, copie os JSONs de `data/pedidos` para a tabela se quiser migrar pedidos existentes.

## Busca de pedido pelo cliente

O cliente pode buscar pedidos anteriores por:
- e-mail
- WhatsApp

Se o pedido ainda nao estiver pago:
- ele ve a etapa de previa/pagamento

Se o pedido estiver pago:
- ele vai para a tela de entrega

## Limites atuais

- O sistema nao gera musica automaticamente.
- A producao musical continua manual.
- O app apenas organiza o fluxo comercial e operacional.
- Arquivos muito grandes enviados pelo bot do Telegram continuam sujeitos aos limites da Bot API.

## Sobre automacao com Suno

Tecnicamente, da para tentar automacao por navegador com Python ou Playwright:
- abrir o site
- fazer login
- preencher prompt
- esperar gerar
- baixar arquivos
- anexar no app

Mas hoje isso tem desvantagens importantes:
- fluxo fragil se o site mudar
- risco de captcha, bloqueio ou 2FA
- dependencia de sessao logada
- possivel conflito com termos da plataforma
- manutencao continua

Para prototipo interno, isso e possivel.
Para operacao estavel, nao e o caminho mais confiavel.

## Scripts

```json
{
  "dev": "tsx api/app-server.ts",
  "build": "vite build && esbuild api/app-server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
  "start": "node dist/server.cjs",
  "lint": "tsc --noEmit"
}
```

## Validacao

Comandos usados para validar o projeto:

```powershell
npm run lint
npm run build
```
