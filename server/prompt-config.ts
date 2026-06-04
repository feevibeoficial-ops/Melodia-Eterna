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
Sua missao e criar a letra de uma musica altamente emocionante e personalizada com base nas respostas reais fornecidas pelo cliente.

{{respostas_cliente}}

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

function extractBabyName(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const namesAns = resp.respostas.p5 || '';
  const normalized = namesAns.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/menino.*?(?:chamara|ser[aá]|nome(?: é|:)?)[\s"]*([\p{L}\p{N}_-]+)/iu);
  const boyName = match?.[1]?.trim() || 'Teo';

  const girlMatch = normalized.match(/menina.*?(?:chamara|ser[aá]|nome(?: é|:)?)[\s"]*([\p{L}\p{N}_-]+)/iu);
  const girlName = girlMatch?.[1]?.trim() || 'Livia';

  return selectedGenderForRevelacao === 'menina' ? girlName : boyName;
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

async function buildRespostasCliente(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const themes = await listThemes().catch(() => []);
  const theme = themes.find((item) => item.id === resp.temaId);
  const linhas = [
    `Tema selecionado: ${theme?.titulo || resp.temaId}`,
    ...Object.entries(resp.respostas).map(([questionId, answer]) => {
      const question = theme?.perguntas.find((item) => item.id === questionId);
      const label = question?.label || questionId;
      return `${label}: ${answer}`;
    }),
  ];

  if (resp.temaId === 'revelacao') {
    linhas.push(`Sexo revelado no cha: ${selectedGenderForRevelacao === 'menina' ? 'Menina' : 'Menino'}`);
    linhas.push(`Nome escolhido do bebe: ${extractBabyName(resp, selectedGenderForRevelacao)}`);
  }

  return linhas.join('\n');
}

export async function buildComposePrompt(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const templates = await listPromptTemplates();
  const promptTemplate = templates.find((item) => item.temaId === resp.temaId);
  const babyName = extractBabyName(resp, selectedGenderForRevelacao);

  return applyTemplate(promptTemplate?.composeTemplate || DEFAULT_COMPOSE_TEMPLATE, {
    respostas_cliente: await buildRespostasCliente(resp, selectedGenderForRevelacao),
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
  const babyName = extractBabyName(resp, selectedGenderForRevelacao);

  return applyTemplate(promptTemplate?.refineTemplate || DEFAULT_REFINE_TEMPLATE, {
    feedback_usuario: feedbackUsuario,
    letra_anterior: letraAnterior,
    revelacao_refine_regra: resp.temaId === 'revelacao'
      ? `5. O nome "${babyName}" deve continuar sendo a ultima palavra da cancao.`
      : '',
  }).trim();
}
