import fs from 'fs';
import path from 'path';
import type { PromptTemplate, RespostasFormulario, TemaId } from '../src/types.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { listThemes } from './theme-config.js';
import { normalizeTextDeep } from './text-normalize.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompt-templates.json');
const PROMPT_TEMPLATES_TABLE = process.env.SUPABASE_PROMPT_TEMPLATES_TABLE || 'prompt_templates';

const DEFAULT_COMPOSE_TEMPLATE = `Voce e um compositor musical senior com extrema sensibilidade poetica.
Sua missao e criar a letra de uma musica altamente emocionante e personalizada com base nas seguintes respostas reais fornecidas pelo cliente:

{{tema_detail}}

Estilo musical desejado: {{estilo_musical}}
Voz preferida: {{voz_preferida}}

DIRETRIZES OBRIGATORIAS:
1. Escreva em primeira pessoa, representando o sentimento do cliente.
2. Nao use marcacoes estruturais como "[Verso]", "[Refrao]", "Verso 1", "Ponte" ou similares.
3. Garanta alta carga emocional, com rimas naturais e ritmo envolvente adaptado ao genero "{{estilo_musical}}".
4. Integre memorias, piadas internas, apelidos e fatos de forma poetica, sem despejar as respostas cruas.
5. A composicao deve ter duracao sugerida de cerca de 4 minutos, com 4 a 6 estrofes e refroes emocionantes.
{{revelacao_regra}}

Escreva apenas a letra da musica, de forma direta e limpa, sem titulos, observacoes ou assinaturas.`;

const DEFAULT_REFINE_TEMPLATE = `Voce e o mesmo compositor senior. Voce ja compos uma musica personalizada.
O cliente gostaria de ajustar trechos com base no seguinte feedback:

FEEDBACK DO USUARIO: "{{feedback_usuario}}"

LETRA ATUAL:
"""
{{letra_anterior}}
"""

DIRETRIZES:
1. Reescreva apenas o necessario para atender ao feedback, preservando o que ja funciona.
2. Mantenha a historia e as rimas conectadas de forma natural.
3. Nao use marcacoes como "[Verso]" ou "[Refrao]".
4. Mantenha o estilo em primeira pessoa.
{{revelacao_refine_regra}}

Escreva apenas a nova letra, sem explicar alteracoes.`;

function buildThemeDetail(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  if (resp.temaId === 'romantica') {
    return `Esta e uma musica romantica em primeira pessoa.
Nome do casal: ${resp.respostas.p1}
Data de inicio/casamento: ${resp.respostas.p2}
Como se conheceram: ${resp.respostas.p3}
Qualidades que mais apaixonam: ${resp.respostas.p4}
Momentos inesqueciveis: ${resp.respostas.p5}
Apelidos/piadas/manias: ${resp.respostas.p6}`;
  }

  if (resp.temaId === 'mae') {
    return `Esta e uma musica de homenagem de filho(a) para sua mae.
Nome/apelido carinhoso dela: ${resp.respostas.p1}
Ensinamentos, conselhos e frases classicas dela: ${resp.respostas.p2}
Maior licao de resiliencia, amor ou sacrificio dela: ${resp.respostas.p3}
Lembranca doce de infancia ou cheiro/comida do lar: ${resp.respostas.p4}
O que deseja agradecer e declarar: ${resp.respostas.p5}`;
  }

  if (resp.temaId === 'pai') {
    return `Esta e uma musica de homenagem para seu pai.
Nome/como a familia o chama: ${resp.respostas.p1}
Passatempo favorito ou mania engracada: ${resp.respostas.p2}
Conselho mais marcante ou conversa valiosa: ${resp.respostas.p3}
Historia de protecao, parceria ou orgulho: ${resp.respostas.p4}
3 palavras fundamentais que o definem: ${resp.respostas.p5}`;
  }

  if (resp.temaId === 'filho') {
    return `Esta e uma musica de homenagem de pai, mae ou responsavel para um filho ou filha.
Nome/apelido carinhoso: ${resp.respostas.p1}
Chegada na vida e inicio dessa historia: ${resp.respostas.p2}
Qualidades e atitudes que enchem o coracao de orgulho: ${resp.respostas.p3}
Momento inesquecivel vivido juntos: ${resp.respostas.p4}
Sonhos, desejos e mensagens para o futuro: ${resp.respostas.p5}
Apelidos, brincadeiras, manias ou detalhes especiais: ${resp.respostas.p6}`;
  }

  if (resp.temaId === 'debutante') {
    return `Esta e uma musica de homenagem para debutante de 15 anos.
Nome da debutante e data especial: ${resp.respostas.p1}
Como os pais descrevem a transicao dela/orgulhos: ${resp.respostas.p2}
Hobbies e preferencias (danca, make, redes, etc): ${resp.respostas.p3}
Sonhos e planos para o futuro: ${resp.respostas.p4}
Fato fofo ou engracado da infancia: ${resp.respostas.p5}`;
  }

  if (resp.temaId === 'amizade') {
    return `Esta e uma musica sobre amizade verdadeira para celebrar nosso grupo de amigos.
Nomes envolvidos: ${resp.respostas.p1}
Como e ha quanto tempo comecou, de onde se conhecem: ${resp.respostas.p2}
Viagens, roles, loucuras compartilhadas: ${resp.respostas.p3}
Situacao marcante de uniao, apoio ou perrengue superado: ${resp.respostas.p4}
Piadas de grupo, manias e expressoes internas de voces: ${resp.respostas.p5}`;
  }

  const namesAns = resp.respostas.p5 || '';
  let boyName = 'Teo';
  const girlName = 'Livia';

  if (namesAns.toLowerCase().includes('menino')) {
    const parts = namesAns.split(/menino/i);
    const boyPart = parts[1] ? parts[1].split(/[,\sE\s]/i)[0] : '';
    if (boyPart.trim().length > 1) {
      boyName = boyPart.trim().replace(/[^\p{L}\p{N}_-]/gu, '');
    }
  }

  const babyName = selectedGenderForRevelacao === 'menina' ? girlName : boyName;
  return `Esta e uma musica emocionante para um cha revelacao de bebe.
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

function getTemaIds(): TemaId[] {
  return ['romantica', 'mae', 'pai', 'filho', 'debutante', 'amizade', 'revelacao'];
}

function buildDefaultTemplates(): PromptTemplate[] {
  const now = new Date().toISOString();
  return getTemaIds().map((temaId) => ({
    temaId,
    composeTemplate: DEFAULT_COMPOSE_TEMPLATE,
    refineTemplate: DEFAULT_REFINE_TEMPLATE,
    updatedAt: now,
  }));
}

function ensureLocalPromptFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(PROMPTS_FILE)) {
    fs.writeFileSync(PROMPTS_FILE, JSON.stringify(buildDefaultTemplates(), null, 2), 'utf-8');
  }
}

async function normalizeTemplates(templates: PromptTemplate[]) {
  const themes = await listThemes().catch(() => []);
  const themeIds = themes.length ? themes.map((theme) => theme.id) : getTemaIds();
  const byTema = new Map(templates.map((template) => [template.temaId, template]));
  return normalizeTextDeep(themeIds.map((temaId) => byTema.get(temaId) || {
    temaId,
    composeTemplate: DEFAULT_COMPOSE_TEMPLATE,
    refineTemplate: DEFAULT_REFINE_TEMPLATE,
    updatedAt: new Date().toISOString(),
  }));
}

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseClient()
      .from(PROMPT_TEMPLATES_TABLE)
      .select('tema_id, compose_template, refine_template, updated_at')
      .order('tema_id', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar templates de prompt no Supabase: ${error.message}`);
    }

    return normalizeTemplates((data || []).map((row: any) => ({
      temaId: row.tema_id as TemaId,
      composeTemplate: row.compose_template,
      refineTemplate: row.refine_template,
      updatedAt: row.updated_at,
    })));
  }

  ensureLocalPromptFile();
  const raw = fs.readFileSync(PROMPTS_FILE, 'utf-8');
  return normalizeTemplates(JSON.parse(raw) as PromptTemplate[]);
}

export async function savePromptTemplate(template: PromptTemplate): Promise<PromptTemplate> {
  const normalized = {
    ...template,
    updatedAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const { error } = await getSupabaseClient()
      .from(PROMPT_TEMPLATES_TABLE)
      .upsert({
        tema_id: normalized.temaId,
        compose_template: normalized.composeTemplate,
        refine_template: normalized.refineTemplate,
        updated_at: normalized.updatedAt,
      }, { onConflict: 'tema_id' });

    if (error) {
      throw new Error(`Erro ao salvar template de prompt no Supabase: ${error.message}`);
    }

    return normalized;
  }

  ensureLocalPromptFile();
  const all = await listPromptTemplates();
  const next = all.map((item) => (item.temaId === normalized.temaId ? normalized : item));
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return normalized;
}

function applyTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

export async function buildComposePrompt(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const templates = await listPromptTemplates();
  const promptTemplate = templates.find((item) => item.temaId === resp.temaId);
  const babyName = selectedGenderForRevelacao === 'menina' ? 'Livia' : 'Teo';

  return applyTemplate(promptTemplate?.composeTemplate || DEFAULT_COMPOSE_TEMPLATE, {
    tema_detail: buildThemeDetail(resp, selectedGenderForRevelacao),
    estilo_musical: resp.estiloMusical,
    voz_preferida: resp.provVoice,
    revelacao_regra: resp.temaId === 'revelacao'
      ? `6. O nome "${babyName}" deve ser estritamente a ultima palavra da cancao.`
      : '',
  }).trim();
}

export async function buildRefinePrompt(
  resp: RespostasFormulario,
  letraAnterior: string,
  feedbackUsuario: string,
  selectedGenderForRevelacao?: 'menino' | 'menina',
) {
  const templates = await listPromptTemplates();
  const promptTemplate = templates.find((item) => item.temaId === resp.temaId);
  const babyName = selectedGenderForRevelacao === 'menina' ? 'Livia' : 'Teo';

  return applyTemplate(promptTemplate?.refineTemplate || DEFAULT_REFINE_TEMPLATE, {
    feedback_usuario: feedbackUsuario,
    letra_anterior: letraAnterior,
    revelacao_refine_regra: resp.temaId === 'revelacao'
      ? `5. O nome "${babyName}" deve continuar sendo a ultima palavra da cancao.`
      : '',
  }).trim();
}
