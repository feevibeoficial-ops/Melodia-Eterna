import { GoogleGenAI } from '@google/genai';
import type { RespostasFormulario } from '../src/types.js';

class GeminiServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'GeminiServiceError';
    this.statusCode = statusCode;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiServiceError('GEMINI_API_KEY nao configurada no servidor.', 500);
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'melodia-eterna',
      },
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusCode(error: any): number | undefined {
  return error?.status ?? error?.code ?? error?.error?.code;
}

function isRetryableGeminiError(error: any): boolean {
  const statusCode = getStatusCode(error);
  return statusCode === 429 || statusCode === 500 || statusCode === 503;
}

function normalizeGeminiError(error: any, fallbackMessage: string): GeminiServiceError {
  const statusCode = getStatusCode(error);

  if (statusCode === 503) {
    return new GeminiServiceError(
      'Nosso estudio esta com alta demanda no momento. Tente novamente em alguns instantes.',
      503,
    );
  }

  if (statusCode === 429) {
    return new GeminiServiceError(
      'Recebemos muitas solicitacoes ao mesmo tempo. Aguarde alguns segundos e tente novamente.',
      429,
    );
  }

  return new GeminiServiceError(fallbackMessage, typeof statusCode === 'number' ? statusCode : 500);
}

async function generateLyricsContent(prompt: string, temperature: number): Promise<string> {
  const client = getGeminiClient();
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature },
      });

      const lyrics = response.text;
      if (!lyrics) {
        throw new GeminiServiceError('A composicao retornou vazia. Tente novamente.', 502);
      }

      return cleanLyrics(lyrics);
    } catch (error: any) {
      const shouldRetry = attempt < maxAttempts && isRetryableGeminiError(error);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(800 * attempt);
    }
  }

  throw new GeminiServiceError('Falha temporaria ao gerar a composicao.', 503);
}

function makeCompositionPrompt(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  let themeDetail = '';

  if (resp.temaId === 'romantica') {
    themeDetail = `Esta e uma musica romantica em primeira pessoa.
Nome do casal: ${resp.respostas.p1}
Data de inicio/casamento: ${resp.respostas.p2}
Como se conheceram: ${resp.respostas.p3}
Qualidades que mais apaixonam: ${resp.respostas.p4}
Momentos inesqueciveis: ${resp.respostas.p5}
Apelidos/piadas/manias: ${resp.respostas.p6}`;
  } else if (resp.temaId === 'mae') {
    themeDetail = `Esta e uma musica de homenagem de filho(a) para sua mae.
Nome/apelido carinhoso dela: ${resp.respostas.p1}
Ensinamentos, conselhos e frases classicas dela: ${resp.respostas.p2}
Maior licao de resiliencia, amor ou sacrificio dela: ${resp.respostas.p3}
Lembranca doce de infancia ou cheiro/comida do lar: ${resp.respostas.p4}
O que deseja agradecer e declarar: ${resp.respostas.p5}`;
  } else if (resp.temaId === 'pai') {
    themeDetail = `Esta e uma musica de homenagem para seu pai.
Nome/como a familia o chama: ${resp.respostas.p1}
Passatempo favorito ou mania engracada: ${resp.respostas.p2}
Conselho mais marcante ou conversa valiosa: ${resp.respostas.p3}
Historia de protecao, parceria ou orgulho: ${resp.respostas.p4}
3 palavras fundamentais que o definem: ${resp.respostas.p5}`;
  } else if (resp.temaId === 'filho') {
    themeDetail = `Esta e uma musica de homenagem de pai, mae ou responsavel para um filho ou filha.
Nome/apelido carinhoso: ${resp.respostas.p1}
Chegada na vida e inicio dessa historia: ${resp.respostas.p2}
Qualidades e atitudes que enchem o coracao de orgulho: ${resp.respostas.p3}
Momento inesquecivel vivido juntos: ${resp.respostas.p4}
Sonhos, desejos e mensagens para o futuro: ${resp.respostas.p5}
Apelidos, brincadeiras, manias ou detalhes especiais: ${resp.respostas.p6}`;
  } else if (resp.temaId === 'debutante') {
    themeDetail = `Esta e uma musica de homenagem para debutante de 15 anos.
Nome da debutante e data especial: ${resp.respostas.p1}
Como os pais descrevem a transicao dela/orgulhos: ${resp.respostas.p2}
Hobbies e preferencias (danca, make, redes, etc): ${resp.respostas.p3}
Sonhos e planos para o futuro: ${resp.respostas.p4}
Fato fofo ou engracado da infancia: ${resp.respostas.p5}`;
  } else if (resp.temaId === 'amizade') {
    themeDetail = `Esta e uma musica sobre amizade verdadeira para celebrar nosso grupo de amigos.
Nomes envolvidos: ${resp.respostas.p1}
Como e ha quanto tempo comecou, de onde se conhecem: ${resp.respostas.p2}
Viagens, roles, loucuras compartilhadas: ${resp.respostas.p3}
Situacao marcante de uniao, apoio ou perrengue superado: ${resp.respostas.p4}
Piadas de grupo, manias e expressoes internas de voces: ${resp.respostas.p5}`;
  } else if (resp.temaId === 'revelacao') {
    const namesAns = resp.respostas.p5 || '';
    let boyName = 'Teo';
    const girlName = 'Livia';

    if (namesAns.toLowerCase().includes('menino')) {
      const parts = namesAns.split(/menino/i);
      const boyPart = parts[1] ? parts[1].split(/[,\sE\s]/i)[0] : '';
      if (boyPart.trim().length > 1) {
        boyName = boyPart.trim().replace(/[^\wA-Za-zÀ-ÿ]/g, '');
      }
    }

    const babyName = selectedGenderForRevelacao === 'menina' ? girlName : boyName;

    themeDetail = `Esta e uma musica emocionante para um cha revelacao de bebe.
Nome dos pais: ${resp.respostas.p1}
Descoberta da gravidez e a doce ansiedade: ${resp.respostas.p2}
Palpites da familia: ${resp.respostas.p3}
Mensagem de amor de que ja o(a) amam muito: ${resp.respostas.p4}
SEXO REVELADO NO CHA: ${selectedGenderForRevelacao === 'menina' ? 'Menina' : 'Menino'}
NOME ESCOLHIDO DO BEBE: "${babyName}"

REGRA ABSOLUTA:
Voce deve compor a letra de modo que a revelacao do nome "${babyName}" aconteca exatamente na ultima palavra de toda a letra.
Nao use o nome do bebe em nenhum outro lugar da musica.`;
  }

  return `Voce e um compositor musical senior com extrema sensibilidade poetica.
Sua missao e criar a letra de uma musica altamente emocionante e personalizada com base nas seguintes respostas reais fornecidas pelo cliente:

${themeDetail}

Estilo musical desejado: ${resp.estiloMusical}
Voz preferida: ${resp.provVoice}

DIRETRIZES OBRIGATORIAS:
1. Escreva em primeira pessoa, representando o sentimento do cliente.
2. Nao use marcacoes estruturais como "[Verso]", "[Refrao]", "Verso 1", "Ponte" ou similares.
3. Garanta alta carga emocional, com rimas naturais e ritmo envolvente adaptado ao genero "${resp.estiloMusical}".
4. Integre memorias, piadas internas, apelidos e fatos de forma poetica, sem despejar as respostas cruas.
5. A composicao deve ter duracao sugerida de cerca de 4 minutos, com 4 a 6 estrofes e refrões emocionantes.
${resp.temaId === 'revelacao' ? `6. O nome "${selectedGenderForRevelacao === 'menina' ? 'Livia' : 'Teo'}" deve ser estritamente a ultima palavra da cancao.` : ''}

Escreva apenas a letra da musica, de forma direta e limpa, sem titulos, observacoes ou assinaturas.`;
}

export async function composeLyrics(
  respostas: RespostasFormulario,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<string> {
  const prompt = makeCompositionPrompt(respostas, selectedGenderForRevelacao);

  try {
    return await generateLyricsContent(prompt, 0.8);
  } catch (error: any) {
    throw normalizeGeminiError(error, 'Falha ao compor a letra neste momento.');
  }
}

export async function refineLyrics(
  respostas: RespostasFormulario,
  letraAnterior: string,
  feedbackUsuario: string,
  selectedGenderForRevelacao?: 'menino' | 'menina',
): Promise<string> {
  const prompt = `Voce e o mesmo compositor senior. Voce ja compos uma musica personalizada.
O cliente gostaria de ajustar trechos com base no seguinte feedback:

FEEDBACK DO USUARIO: "${feedbackUsuario}"

LETRA ATUAL:
"""
${letraAnterior}
"""

DIRETRIZES:
1. Reescreva apenas o necessario para atender ao feedback, preservando o que ja funciona.
2. Mantenha a historia e as rimas conectadas de forma natural.
3. Nao use marcacoes como "[Verso]" ou "[Refrao]".
4. Mantenha o estilo em primeira pessoa.
${respostas.temaId === 'revelacao' ? `5. O nome "${selectedGenderForRevelacao === 'menina' ? 'Livia' : 'Teo'}" deve continuar sendo a ultima palavra da cancao.` : ''}

Escreva apenas a nova letra, sem explicar alteracoes.`;

  try {
    return await generateLyricsContent(prompt, 0.7);
  } catch (error: any) {
    throw normalizeGeminiError(error, 'Falha ao refinar a composicao neste momento.');
  }
}

function cleanLyrics(text: string): string {
  return text
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\([^)]+\)/g, (match) => {
      const lower = match.toLowerCase();
      if (lower.includes('refrao') || lower.includes('verso') || lower.includes('ponte') || lower.includes('intro') || lower.includes('outro')) {
        return '';
      }
      return match;
    })
    .replace(/(Verso \d+|Refrao|Ponte|Introducao|Letra:)/gi, '')
    .trim();
}
