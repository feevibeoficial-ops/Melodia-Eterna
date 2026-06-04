import fs from 'fs';
import path from 'path';
import type { TemaConfig, TemaPergunta } from '../src/types.js';
import { DEFAULT_TEMAS } from '../src/types.js';
import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';
import { normalizeTextDeep } from './text-normalize.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const THEMES_FILE = path.join(DATA_DIR, 'themes.json');

function ensureLocalThemesFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(THEMES_FILE)) {
    fs.writeFileSync(THEMES_FILE, JSON.stringify(DEFAULT_TEMAS, null, 2), 'utf-8');
  }
}

function normalizeTheme(theme: Partial<TemaConfig>): TemaConfig {
  return normalizeTextDeep({
    id: theme.id || 'tema',
    titulo: theme.titulo || 'Tema',
    descricao: theme.descricao || '',
    emoji: theme.emoji || '🎵',
    bgColor: theme.bgColor || 'from-stone-200/40 to-stone-300/20',
    color: theme.color || 'stone',
    sortOrder: theme.sortOrder ?? 0,
    isActive: theme.isActive ?? true,
    perguntas: (theme.perguntas || []).map((question, index) => normalizeQuestion(question, index)),
  });
}

function normalizeQuestion(question: Partial<TemaPergunta>, index: number): TemaPergunta {
  return normalizeTextDeep({
    id: question.id || `p${index + 1}`,
    label: question.label || '',
    p_placeholder: question.p_placeholder || '',
    description: question.description || '',
    sortOrder: question.sortOrder ?? index,
    isRequired: question.isRequired ?? true,
    isActive: question.isActive ?? true,
  });
}

export async function listThemes(): Promise<TemaConfig[]> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const [{ data: themes, error: themesError }, { data: questions, error: questionsError }] = await Promise.all([
      supabase.from('song_themes').select('*').order('sort_order', { ascending: true }),
      supabase.from('theme_questions').select('*').order('sort_order', { ascending: true }),
    ]);

    if (themesError) {
      throw new Error(`Erro ao listar temas no Supabase: ${themesError.message}`);
    }
    if (questionsError) {
      throw new Error(`Erro ao listar perguntas no Supabase: ${questionsError.message}`);
    }

    const groupedQuestions = new Map<string, TemaPergunta[]>();
    for (const row of questions || []) {
      const list = groupedQuestions.get(row.theme_id) || [];
      list.push(normalizeQuestion({
        id: row.question_id,
        label: row.label,
        p_placeholder: row.placeholder,
        description: row.description,
        sortOrder: row.sort_order,
        isRequired: row.is_required,
        isActive: row.is_active,
      }, row.sort_order || 0));
      groupedQuestions.set(row.theme_id, list);
    }

    return (themes || [])
      .map((row: any) => normalizeTheme({
        id: row.id,
        titulo: row.title,
        descricao: row.description,
        emoji: row.emoji,
        bgColor: row.bg_color,
        color: row.color,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        perguntas: groupedQuestions.get(row.id) || [],
      }))
      .filter((theme) => theme.isActive !== false);
  }

  ensureLocalThemesFile();
  return (JSON.parse(fs.readFileSync(THEMES_FILE, 'utf-8')) as TemaConfig[]).map(normalizeTheme);
}

export async function upsertTheme(theme: TemaConfig): Promise<TemaConfig> {
  const normalized = normalizeTheme(theme);

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error: themeError } = await supabase.from('song_themes').upsert({
      id: normalized.id,
      title: normalized.titulo,
      description: normalized.descricao,
      emoji: normalized.emoji,
      bg_color: normalized.bgColor,
      color: normalized.color,
      sort_order: normalized.sortOrder ?? 0,
      is_active: normalized.isActive ?? true,
    }, { onConflict: 'id' });

    if (themeError) {
      throw new Error(`Erro ao salvar tema no Supabase: ${themeError.message}`);
    }

    const { error: deleteQuestionsError } = await supabase.from('theme_questions').delete().eq('theme_id', normalized.id);
    if (deleteQuestionsError) {
      throw new Error(`Erro ao substituir perguntas do tema: ${deleteQuestionsError.message}`);
    }

    if (normalized.perguntas.length) {
      const { error: insertQuestionsError } = await supabase.from('theme_questions').insert(
        normalized.perguntas.map((question, index) => ({
          theme_id: normalized.id,
          question_id: question.id,
          label: question.label,
          placeholder: question.p_placeholder,
          description: question.description || null,
          sort_order: question.sortOrder ?? index,
          is_required: question.isRequired ?? true,
          is_active: question.isActive ?? true,
        })),
      );

      if (insertQuestionsError) {
        throw new Error(`Erro ao salvar perguntas do tema: ${insertQuestionsError.message}`);
      }
    }

    return normalized;
  }

  ensureLocalThemesFile();
  const themes = await listThemes();
  const filtered = themes.filter((item) => item.id !== normalized.id);
  filtered.push(normalized);
  filtered.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  fs.writeFileSync(THEMES_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return normalized;
}

export async function deleteTheme(themeId: string): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('song_themes').delete().eq('id', themeId);
    if (error) {
      throw new Error(`Erro ao excluir tema no Supabase: ${error.message}`);
    }
    return;
  }

  ensureLocalThemesFile();
  const themes = await listThemes();
  fs.writeFileSync(THEMES_FILE, JSON.stringify(themes.filter((item) => item.id !== themeId), null, 2), 'utf-8');
}
