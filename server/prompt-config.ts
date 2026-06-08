import fs from 'fs';
import path from 'path';
import type { PromptTemplate, RespostasFormulario, TemaId } from '../src/types.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { listThemes } from './theme-config.js';
import { normalizeTextDeep } from './text-normalize.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const PROMPTS_FILE = path.join(DATA_DIR, 'prompt-templates.json');
const PROMPT_TEMPLATES_TABLE = process.env.SUPABASE_PROMPT_TEMPLATES_TABLE || 'prompt_templates';

const DEFAULT_COMPOSE_TEMPLATE = `Voce e um compositor profissional, especializado em transformar historias reais enviadas por clientes em musicas completas, emocionantes e prontas para gravacao.
Sua missao e transformar todo o conteudo enviado em uma musica completa, usando apenas as informacoes reais fornecidas pelo cliente.

{{respostas_cliente}}

Estilo musical desejado: {{estilo_musical}}
Voz preferida: {{voz_preferida}}

DIRETRIZES OBRIGATORIAS:
1. Transforme TODO o texto enviado em musica.
2. Nao invente fatos e nao altere o sentido da historia.
3. Organize a narrativa musicalmente com comeco, desenvolvimento, climax e final.
4. Use linguagem simples, humana, emocional, cantavel e natural.
5. A letra deve ser longa o suficiente para uma musica de aproximadamente 4 minutos.
6. Evite soar como boletim, texto frio, informativo ou literario demais.
7. Os versos devem ser respirados, naturais, musicais e conectados entre si.
8. Escreva sempre em primeira pessoa, representando quem esta contando a historia.
9. Se houver indicacao clara de perspectiva, adapte toda a letra a ela do comeco ao fim.
10. Inclua todos os nomes enviados pelo cliente.
11. So use datas se estiverem nas respostas e, quando usar, escreva por extenso.
12. Trate temas sensiveis com respeito, sutileza e foco em emocao, aprendizado, superacao e sentimento atual.
13. Evite totalmente rimas forcadas. Use rimas apenas quando forem naturais.
14. Nao jogue palavras apenas para rimar.
15. Use obrigatoriamente marcacoes estruturais exatamente nesta ordem: [Intro], [Verso 1], [Refrao], [Instrumental], [Verso 2], [Refrao], [Ponte], [Refrao].
16. Nao use outros blocos alem desses e nao altere a ordem.
17. O [Refrao] deve aparecer 3 vezes ao longo da musica, repetido textualmente ou com variacao minima quando necessario para soar natural.
18. O [Refrao] deve resumir o sentimento principal da historia, ter impacto emocional, ser facil de cantar e memoravel.
19. Adapte o ritmo e a atmosfera ao genero "{{estilo_musical}}".
{{revelacao_regra}}

Escreva apenas a letra da musica, com as marcacoes estruturais, sem comentarios extras, sem explicacoes e sem observacoes fora da letra.`;

const DEFAULT_REFINE_TEMPLATE = `Voce e o mesmo compositor senior. Voce ja compos uma musica personalizada.
O cliente gostaria de ajustar trechos com base no seguinte feedback:

FEEDBACK DO USUARIO: "{{feedback_usuario}}"

LETRA ATUAL:
"""
{{letra_anterior}}
"""

DIRETRIZES:
1. Reescreva apenas o necessario para atender ao feedback, preservando o que ja funciona.
2. Mantenha a historia, a perspectiva em primeira pessoa e a conexao emocional entre os versos.
3. Preserve ou reorganize a estrutura marcada exatamente nesta ordem: [Intro], [Verso 1], [Refrao], [Instrumental], [Verso 2], [Refrao], [Ponte], [Refrao].
4. Preserve o [Refrao] como ponto central, forte, memoravel e repetido 3 vezes ao longo da musica.
5. Evite rimas forcadas e mantenha a letra cantavel.
{{revelacao_refine_regra}}

Escreva apenas a nova letra, sem explicar alteracoes.`;

const DEFAULT_REVELACAO_COMPOSE_TEMPLATE = `Voce e um compositor profissional, especializado em transformar historias reais enviadas por clientes em musicas completas, emocionantes e prontas para gravacao.
Sua missao e criar a letra de uma musica altamente emocionante e personalizada para um cha revelacao, usando apenas as respostas reais fornecidas pelo cliente.

{{respostas_cliente}}

Estilo musical desejado: {{estilo_musical}}
Voz preferida: {{voz_preferida}}

DIRETRIZES OBRIGATORIAS:
1. Transforme TODO o texto enviado em musica, sem inventar fatos e sem alterar o sentido da historia.
2. Organize a narrativa com comeco, desenvolvimento, crescimento de expectativa, grande revelacao e final emocional.
3. Use linguagem simples, humana, delicada, familiar e cantavel.
4. A letra deve ser longa o suficiente para uma musica de aproximadamente 4 minutos.
5. Use obrigatoriamente marcacoes estruturais exatamente nesta ordem: [Intro], [Verso 1], [Refrao], [Instrumental], [Verso 2], [Refrao], [Ponte], [Refrao].
6. Nao use outros blocos alem desses e nao altere a ordem.
7. O [Refrao] deve aparecer 3 vezes e resumir o sentimento principal da historia.
8. Escreva em primeira pessoa, representando o sentimento do cliente.
9. O sexo revelado no cha e: "{{sexo_bebe_revelacao}}".
10. O nome escolhido do bebe e: "{{nome_bebe_revelacao}}".
11. Antes da [Ponte], nao escreva o nome "{{nome_bebe_revelacao}}" em nenhum trecho.
12. A primeira vez que o nome "{{nome_bebe_revelacao}}" aparecer deve ser obrigatoriamente como a ultima palavra da [Ponte].
13. O ultimo [Refrao] deve ser um refrao novo, diferente dos refroes anteriores, ja revelado e contendo o nome "{{nome_bebe_revelacao}}" de forma emocional e memoravel.
14. Depois da [Ponte], o nome "{{nome_bebe_revelacao}}" pode se repetir no ultimo [Refrao] para criar memoria emocional.
15. A ultima palavra de toda a cancao deve ser obrigatoriamente "{{nome_bebe_revelacao}}".
16. Inclua todos os nomes relevantes enviados pelo cliente.
17. Evite rimas forcadas, palavras soltas e excesso de literalidade.
18. Conduza a musica para que a revelacao final tenha impacto emocional maximo.

Escreva apenas a letra da musica, com as marcacoes estruturais, sem comentarios extras e sem explicacoes fora da letra.`;

const DEFAULT_REVELACAO_REFINE_TEMPLATE = `Voce e o mesmo compositor senior. Voce ja compos uma musica personalizada para um cha revelacao.
O cliente gostaria de ajustar trechos com base no seguinte feedback:

FEEDBACK DO USUARIO: "{{feedback_usuario}}"

LETRA ATUAL:
"""
{{letra_anterior}}
"""

DIRETRIZES:
1. Reescreva apenas o necessario para atender ao feedback, preservando o que ja funciona.
2. Mantenha a historia, a emocao, a expectativa e a estrutura da musica.
3. Preserve ou reorganize as marcacoes estruturais exatamente nesta ordem: [Intro], [Verso 1], [Refrao], [Instrumental], [Verso 2], [Refrao], [Ponte], [Refrao].
4. Continue em primeira pessoa.
5. O sexo revelado no cha continua sendo "{{sexo_bebe_revelacao}}".
6. Antes da [Ponte], nao escreva o nome "{{nome_bebe_revelacao}}" em nenhum trecho.
7. A primeira vez que o nome "{{nome_bebe_revelacao}}" aparecer deve continuar sendo obrigatoriamente como a ultima palavra da [Ponte].
8. O ultimo [Refrao] deve ser um refrao novo, diferente dos refroes anteriores, ja revelado e contendo o nome "{{nome_bebe_revelacao}}" de forma emocional e memoravel.
9. A ultima palavra de toda a cancao deve continuar sendo obrigatoriamente "{{nome_bebe_revelacao}}".
10. Preserve o impacto emocional da revelacao e a repeticao forte do ultimo [Refrao].

Escreva apenas a nova letra, sem explicar alteracoes.`;

function extractBabyName(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const namesAns = resp.respostas.p5 || '';
  const normalized = namesAns.replace(/\s+/g, ' ').trim();

  const captureName = (target: 'menino' | 'menina', fallback: string) => {
    const pattern = new RegExp(
      `${target}.*?(?:chamara|ser[aá]|nome(?: é|:)?|é|e)[\\s"]*([\\p{L}\\p{N}_-]+)`,
      'iu',
    );
    const match = normalized.match(pattern);
    return match?.[1]?.trim() || fallback;
  };

  const boyName = captureName('menino', 'Teo');
  const girlName = captureName('menina', 'Livia');

  return selectedGenderForRevelacao === 'menina' ? girlName : boyName;
}

function extractRevealBabyName(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const namesAns = normalizeTextDeep(resp.respostas.p5 || '').replace(/\r/g, '\n').trim();

  const captureName = (target: 'menino' | 'menina', fallback: string) => {
    const lineMatch = namesAns.match(new RegExp(`^\\s*${target}\\s*(?:e|é|:|-)?\\s*([^\\n]+)`, 'imu'));
    if (lineMatch?.[1]) {
      return lineMatch[1].replace(/^(?:e|é|:|-)\s*/i, '').trim().split(/\s+/)[0] || fallback;
    }

    const sentenceMatch = namesAns.match(new RegExp(`${target}[^\\p{L}\\p{N}]+(?:se\\s+chamara|chamara|sera|será|nome\\s*(?:e|é|:)?)\\s+([\\p{L}\\p{N}_-]+)`, 'iu'));
    return sentenceMatch?.[1]?.trim() || fallback;
  };

  return selectedGenderForRevelacao === 'menina'
    ? captureName('menina', 'Livia')
    : captureName('menino', 'Teo');
}

function getTemaIds(): TemaId[] {
  return ['romantica', 'mae', 'pai', 'filho', 'debutante', 'amizade', 'revelacao'];
}

function buildDefaultTemplates(): PromptTemplate[] {
  const now = new Date().toISOString();
  return getTemaIds().map((temaId) => ({
    temaId,
    composeTemplate: temaId === 'revelacao' ? DEFAULT_REVELACAO_COMPOSE_TEMPLATE : DEFAULT_COMPOSE_TEMPLATE,
    refineTemplate: temaId === 'revelacao' ? DEFAULT_REVELACAO_REFINE_TEMPLATE : DEFAULT_REFINE_TEMPLATE,
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
    linhas.push(`Sexo revelado no chá: ${selectedGenderForRevelacao === 'menina' ? 'Menina' : 'Menino'}`);
    linhas.push(`Nome escolhido do bebê: ${extractRevealBabyName(resp, selectedGenderForRevelacao)}`);
  }

  return linhas.join('\n');
}

export async function buildComposePrompt(resp: RespostasFormulario, selectedGenderForRevelacao?: 'menino' | 'menina') {
  const templates = await listPromptTemplates();
  const promptTemplate = templates.find((item) => item.temaId === resp.temaId);
  const babyName = extractRevealBabyName(resp, selectedGenderForRevelacao);
  const babyGender = selectedGenderForRevelacao === 'menina' ? 'Menina' : 'Menino';

  return applyTemplate(promptTemplate?.composeTemplate || DEFAULT_COMPOSE_TEMPLATE, {
    respostas_cliente: await buildRespostasCliente(resp, selectedGenderForRevelacao),
    estilo_musical: resp.estiloMusical,
    voz_preferida: resp.provVoice,
    nome_bebe_revelacao: babyName,
    sexo_bebe_revelacao: babyGender,
    revelacao_regra: resp.temaId === 'revelacao'
      ? `20. Antes da [Ponte], nao escreva o nome "${babyName}" em nenhum trecho.
21. A primeira vez que o nome "${babyName}" aparecer deve ser obrigatoriamente como a ultima palavra da [Ponte].
22. O ultimo [Refrao] deve ser um refrao novo, diferente dos refroes anteriores, ja revelado e contendo o nome "${babyName}".
23. A ultima palavra de toda a cancao deve ser obrigatoriamente "${babyName}".`
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
  const babyName = extractRevealBabyName(resp, selectedGenderForRevelacao);
  const babyGender = selectedGenderForRevelacao === 'menina' ? 'Menina' : 'Menino';

  return applyTemplate(promptTemplate?.refineTemplate || DEFAULT_REFINE_TEMPLATE, {
    feedback_usuario: feedbackUsuario,
    letra_anterior: letraAnterior,
    nome_bebe_revelacao: babyName,
    sexo_bebe_revelacao: babyGender,
    revelacao_refine_regra: resp.temaId === 'revelacao'
      ? `11. Antes da [Ponte], nao escreva o nome "${babyName}" em nenhum trecho.
12. A primeira vez que o nome "${babyName}" aparecer deve ser obrigatoriamente como a ultima palavra da [Ponte].
13. O ultimo [Refrao] deve ser um refrao novo, diferente dos refroes anteriores, ja revelado e contendo o nome "${babyName}".
14. A ultima palavra de toda a cancao deve continuar sendo obrigatoriamente "${babyName}".`
      : '',
  }).trim();
}
