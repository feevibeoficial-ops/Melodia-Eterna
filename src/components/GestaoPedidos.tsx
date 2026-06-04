import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, LoaderCircle, Lock, Music2, Plus, RefreshCw, Save, Send, Trash2 } from 'lucide-react';
import { DEFAULT_TEMAS, PedidoMusica, PromptTemplate, TemaConfig, TemaId, TemaPergunta } from '../types';

interface GestaoPedidosProps {
  onBack: () => void;
}

type GestaoTab = 'pedidos' | 'modelos' | 'prompts';

type Drafts = Record<string, {
  source1: string;
  source2: string;
  referenceUrl1: string;
  referenceUrl2: string;
  fileName1: string;
  fileName2: string;
}>;

export default function GestaoPedidos({ onBack }: GestaoPedidosProps) {
  const [password, setPassword] = useState(() => localStorage.getItem('melodia_admin_password') || '');
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [orders, setOrders] = useState<PedidoMusica[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [promptTemplates, setPromptTemplates] = useState<Record<string, PromptTemplate>>({});
  const [themes, setThemes] = useState<TemaConfig[]>(DEFAULT_TEMAS);
  const [promptBusyId, setPromptBusyId] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<GestaoTab>('pedidos');

  async function loadOrders() {
    setLoading(true);
    setAuthError(null);
    setPageError(null);

    try {
      const response = await fetch('/api/admin/orders', {
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          setAuthenticated(false);
          localStorage.removeItem('melodia_admin_password');
        }
        throw new Error(data.error || 'Falha ao carregar os pedidos.');
      }

      setAuthenticated(true);
      localStorage.setItem('melodia_admin_password', password);
      setOrders(data);
      setDrafts((current) => {
        const next = { ...current };
        for (const order of data as PedidoMusica[]) {
          next[order.id] = next[order.id] || {
            source1: '',
            source2: '',
            referenceUrl1: order.url_referencia_externa_1 || '',
            referenceUrl2: order.url_referencia_externa_2 || '',
            fileName1: '',
            fileName2: '',
          };
        }
        return next;
      });
      await loadThemes();
      await loadPromptTemplates();
    } finally {
      setLoading(false);
    }
  }

  async function loadThemes() {
    const response = await fetch('/api/admin/themes', {
      headers: { 'x-admin-password': password },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao carregar os modelos de musica.');
    }
    setThemes(data as TemaConfig[]);
  }

  async function loadPromptTemplates() {
    const response = await fetch('/api/admin/prompt-templates', {
      headers: { 'x-admin-password': password },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Falha ao carregar os prompts.');
    }

    setPromptTemplates(
      (data as PromptTemplate[]).reduce<Record<string, PromptTemplate>>((acc, template) => {
        acc[template.temaId] = template;
        return acc;
      }, {}),
    );
  }

  useEffect(() => {
    if (!password) return;
    loadOrders().catch((err) => {
      setLoading(false);
      setAuthError(err.message);
    });
  }, []);

  function setDraft(orderId: string, patch: Partial<Drafts[string]>) {
    setDrafts((current) => ({
      ...current,
      [orderId]: {
        source1: current[orderId]?.source1 || '',
        source2: current[orderId]?.source2 || '',
        referenceUrl1: current[orderId]?.referenceUrl1 || '',
        referenceUrl2: current[orderId]?.referenceUrl2 || '',
        fileName1: current[orderId]?.fileName1 || '',
        fileName2: current[orderId]?.fileName2 || '',
        ...patch,
      },
    }));
  }

  function setPromptDraft(temaId: TemaId, patch: Partial<PromptTemplate>) {
    setPromptTemplates((current) => ({
      ...current,
      [temaId]: {
        temaId,
        composeTemplate: current[temaId]?.composeTemplate || '',
        refineTemplate: current[temaId]?.refineTemplate || '',
        updatedAt: current[temaId]?.updatedAt || new Date().toISOString(),
        ...patch,
      },
    }));
  }

  function setThemeDraft(themeId: string, patch: Partial<TemaConfig>) {
    setThemes((current) => current.map((theme) => theme.id === themeId ? { ...theme, ...patch } : theme));
  }

  function setThemeQuestionDraft(themeId: string, questionId: string, patch: Partial<TemaPergunta>) {
    setThemes((current) => current.map((theme) => {
      if (theme.id !== themeId) return theme;
      return {
        ...theme,
        perguntas: theme.perguntas.map((question) => question.id === questionId ? { ...question, ...patch } : question),
      };
    }));
  }

  async function login() {
    try {
      await loadOrders();
    } catch (err: any) {
      setAuthError(err.message || 'Senha invalida.');
    }
  }

  async function uploadFile(orderId: string, slot: 'v1' | 'v2', file: File) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/upload/${slot}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-admin-password': password,
          'x-file-name': encodeURIComponent(file.name),
        },
        body: await file.arrayBuffer(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha no upload.');

      if (slot === 'v1') {
        setDraft(orderId, { source1: data.tempPath, fileName1: data.fileName });
      } else {
        setDraft(orderId, { source2: data.tempPath, fileName2: data.fileName });
      }
    } catch (err: any) {
      setPageError(err.message || 'Falha no upload.');
    } finally {
      setBusyId(null);
    }
  }

  async function attachAudio(orderId: string) {
    const draft = drafts[orderId];
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/attach-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao anexar audio.');
      await loadOrders();
      setDraft(orderId, { source1: '', source2: '', fileName1: '', fileName2: '' });
    } catch (err: any) {
      setPageError(err.message || 'Falha ao anexar audio.');
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao marcar como pago.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao marcar como pago.');
    } finally {
      setBusyId(null);
    }
  }

  async function markUnpaid(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/mark-unpaid`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao voltar para nao pago.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao voltar para nao pago.');
    } finally {
      setBusyId(null);
    }
  }

  async function resetAudio(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/reset-audio`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao limpar as faixas.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao limpar as faixas.');
    } finally {
      setBusyId(null);
    }
  }

  async function resendTelegram(orderId: string) {
    setBusyId(orderId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/resend-telegram`, {
        method: 'POST',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao reenviar a letra no Telegram.');
      await loadOrders();
    } catch (err: any) {
      setPageError(err.message || 'Falha ao reenviar a letra no Telegram.');
    } finally {
      setBusyId(null);
    }
  }

  async function savePromptTemplate(temaId: TemaId) {
    const template = promptTemplates[temaId];
    if (!template) return;

    setPromptBusyId(temaId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/prompt-templates/${temaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(template),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar prompt.');
      setPromptTemplates((current) => ({
        ...current,
        [temaId]: data as PromptTemplate,
      }));
    } catch (err: any) {
      setPageError(err.message || 'Falha ao salvar prompt.');
    } finally {
      setPromptBusyId(null);
    }
  }

  async function saveTheme(theme: TemaConfig) {
    setPromptBusyId(theme.id);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/themes/${theme.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(theme),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar modelo.');
      setThemes((current) => current.map((item) => item.id === theme.id ? data as TemaConfig : item));
    } catch (err: any) {
      setPageError(err.message || 'Falha ao salvar modelo.');
    } finally {
      setPromptBusyId(null);
    }
  }

  async function createTheme() {
    const timestamp = Date.now().toString(36);
    const theme: TemaConfig = {
      id: `novo_tema_${timestamp}`,
      titulo: 'Novo tema',
      descricao: 'Descreva este modelo musical.',
      emoji: '🎵',
      bgColor: 'from-stone-200/40 to-stone-300/20',
      color: 'stone',
      sortOrder: themes.length,
      isActive: true,
      perguntas: [
        {
          id: 'p1',
          label: 'Nova pergunta',
          p_placeholder: 'Digite um exemplo de resposta',
          description: '',
          sortOrder: 0,
          isRequired: true,
          isActive: true,
        },
      ],
    };

    setPromptBusyId(theme.id);
    setPageError(null);
    try {
      const response = await fetch('/api/admin/themes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify(theme),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao criar modelo.');
      setThemes((current) => [...current, data as TemaConfig]);
      setPromptTemplates((current) => ({
        ...current,
        [theme.id]: {
          temaId: theme.id,
          composeTemplate: current.romantica?.composeTemplate || '',
          refineTemplate: current.romantica?.refineTemplate || '',
          updatedAt: new Date().toISOString(),
        },
      }));
    } catch (err: any) {
      setPageError(err.message || 'Falha ao criar modelo.');
    } finally {
      setPromptBusyId(null);
    }
  }

  async function removeTheme(themeId: string) {
    setPromptBusyId(themeId);
    setPageError(null);
    try {
      const response = await fetch(`/api/admin/themes/${themeId}`, {
        method: 'DELETE',
        headers: { 'x-admin-password': password },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao excluir modelo.');
      setThemes((current) => current.filter((item) => item.id !== themeId));
    } catch (err: any) {
      setPageError(err.message || 'Falha ao excluir modelo.');
    } finally {
      setPromptBusyId(null);
    }
  }

  function addQuestion(themeId: string) {
    setThemes((current) => current.map((theme) => {
      if (theme.id !== themeId) return theme;
      const nextIndex = theme.perguntas.length + 1;
      return {
        ...theme,
        perguntas: [
          ...theme.perguntas,
          {
            id: `p${nextIndex}`,
            label: `Pergunta ${nextIndex}`,
            p_placeholder: 'Digite um exemplo de resposta',
            description: '',
            sortOrder: nextIndex - 1,
            isRequired: true,
            isActive: true,
          },
        ],
      };
    }));
  }

  function removeQuestion(themeId: string, questionId: string) {
    setThemes((current) => current.map((theme) => {
      if (theme.id !== themeId) return theme;
      return {
        ...theme,
        perguntas: theme.perguntas.filter((question) => question.id !== questionId),
      };
    }));
  }

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white border border-natural-border rounded-3xl shadow-xs p-6 space-y-5">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext uppercase tracking-wider cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-natural-sage/10 mx-auto flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-natural-sage" />
            </div>
            <h2 className="text-2xl font-bold font-display text-natural-dark">Acesso a Gestao</h2>
            <p className="text-sm text-natural-subtext mt-1">Informe a senha para abrir a area interna de pedidos.</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha da gestao"
            className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
          />
          {authError && <p className="text-sm text-[#9A5B33]">{authError}</p>}
          <button type="button" onClick={() => login().catch(console.error)} className="w-full py-3 bg-natural-sage text-white rounded-xl text-sm font-bold cursor-pointer">
            Entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex justify-between items-center border-b border-natural-border pb-4">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext uppercase tracking-wider cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>
        <button type="button" onClick={() => loadOrders().catch(console.error)} className="flex items-center gap-2 px-4 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold text-natural-dark cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar pedidos
        </button>
      </div>

      <div>
        <h2 className="text-3xl font-bold font-display text-natural-dark">Gestao de Pedidos</h2>
        <p className="text-sm text-natural-subtext mt-1">
          Anexe as duas musicas, registre as URLs de referencia e marque o pagamento manualmente quando receber o comprovante.
        </p>
      </div>

      <div className="bg-white border border-natural-border rounded-3xl p-2 shadow-xs">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'pedidos', label: `Pedidos (${orders.length})` },
            { id: 'modelos', label: `Modelos (${themes.length})` },
            { id: 'prompts', label: `Prompts (${Object.keys(promptTemplates).length || themes.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as GestaoTab)}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold cursor-pointer transition-all ${
                activeTab === tab.id
                  ? 'bg-natural-sage text-white shadow-xs'
                  : 'bg-[#FAF8F5] text-natural-subtext hover:text-natural-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'modelos' && (
      <div className="bg-white border border-natural-border rounded-3xl p-5 md:p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-bold font-display text-natural-dark">Modelos de musica e perguntas</h3>
            <p className="text-sm text-natural-subtext mt-1">
              Cadastre novos modelos, ajuste nome, descricao e questionario sem alterar o codigo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => createTheme().catch(console.error)}
            className="px-4 py-2 bg-natural-sage text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Novo modelo
          </button>
        </div>

        <div className="space-y-4">
          {themes.map((theme) => {
            const saving = promptBusyId === theme.id;
            return (
              <div key={theme.id} className="rounded-2xl border border-natural-border bg-[#FCFBF8] p-4 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-natural-dark">{theme.titulo}</p>
                    <p className="text-[11px] text-natural-subtext">ID tecnico: {theme.id}</p>
                  </div>
                  <div className="text-[11px] text-natural-subtext">
                    {theme.perguntas.length} pergunta(s)
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <input value={theme.titulo} onChange={(e) => setThemeDraft(theme.id, { titulo: e.target.value })} placeholder="Titulo" className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm" />
                  <input value={theme.descricao} onChange={(e) => setThemeDraft(theme.id, { descricao: e.target.value })} placeholder="Descricao" className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm md:col-span-2" />
                  <input value={theme.emoji} onChange={(e) => setThemeDraft(theme.id, { emoji: e.target.value })} placeholder="Emoji" className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm" />
                  <input value={theme.color} onChange={(e) => setThemeDraft(theme.id, { color: e.target.value })} placeholder="Cor" className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm" />
                  <input value={theme.bgColor} onChange={(e) => setThemeDraft(theme.id, { bgColor: e.target.value })} placeholder="Gradiente/Background" className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-sm md:col-span-2" />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-natural-dark">Perguntas</p>
                    <button type="button" onClick={() => addQuestion(theme.id)} className="px-3 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold cursor-pointer">Adicionar pergunta</button>
                  </div>
                  {theme.perguntas.map((question) => (
                    <div key={question.id} className="grid md:grid-cols-2 gap-3 rounded-2xl border border-natural-border bg-white p-3">
                      <input value={question.id} onChange={(e) => setThemeQuestionDraft(theme.id, question.id, { id: e.target.value })} placeholder="ID pergunta" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                      <input value={question.label} onChange={(e) => setThemeQuestionDraft(theme.id, question.id, { label: e.target.value })} placeholder="Texto da pergunta" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                      <input value={question.p_placeholder} onChange={(e) => setThemeQuestionDraft(theme.id, question.id, { p_placeholder: e.target.value })} placeholder="Placeholder" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm md:col-span-2" />
                      <div className="md:col-span-2 flex justify-end">
                        <button type="button" onClick={() => removeQuestion(theme.id, question.id)} className="px-3 py-2 bg-white border border-natural-border rounded-xl text-xs font-semibold text-[#9A5B33] flex items-center gap-2 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" /> Remover pergunta
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={saving} onClick={() => saveTheme(theme)} className="px-4 py-2 bg-natural-sage text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                    <Save className="w-3.5 h-3.5" /> Salvar modelo
                  </button>
                  <button type="button" disabled={saving} onClick={() => removeTheme(theme.id)} className="px-4 py-2 bg-white border border-natural-border rounded-xl text-xs font-bold text-[#9A5B33] flex items-center gap-2 cursor-pointer disabled:opacity-60">
                    <Trash2 className="w-3.5 h-3.5" /> Excluir modelo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {activeTab === 'prompts' && (
      <div className="bg-white border border-natural-border rounded-3xl p-5 md:p-6 shadow-xs space-y-5">
        <div>
          <h3 className="text-2xl font-bold font-display text-natural-dark">Prompts por tema</h3>
          <p className="text-sm text-natural-subtext mt-1">
            Cada tema agora pode ter seu proprio prompt completo. O sistema injeta apenas respostas do cliente, estilo, voz e regras especiais.
          </p>
        </div>

        <div className="rounded-2xl border border-[#E8E2D9] bg-[#FAF8F5] px-4 py-3 text-xs text-natural-subtext leading-relaxed">
          Placeholders disponiveis no prompt de geracao: <strong>{'{{respostas_cliente}}'}</strong>, <strong>{'{{estilo_musical}}'}</strong>, <strong>{'{{voz_preferida}}'}</strong>, <strong>{'{{revelacao_regra}}'}</strong>.
          <br />
          No prompt de refino: <strong>{'{{feedback_usuario}}'}</strong>, <strong>{'{{letra_anterior}}'}</strong>, <strong>{'{{revelacao_refine_regra}}'}</strong>.
        </div>

        <div className="space-y-4">
          {themes.map((tema) => {
            const prompt = promptTemplates[tema.id];
            const saving = promptBusyId === tema.id;

            return (
              <div key={tema.id} className="rounded-2xl border border-natural-border bg-[#FCFBF8] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-natural-dark">{tema.titulo}</p>
                    <p className="text-[11px] text-natural-subtext">ID: {tema.id}</p>
                  </div>
                  <button
                    type="button"
                    disabled={saving || !prompt}
                    onClick={() => savePromptTemplate(tema.id)}
                    className="px-4 py-2 bg-natural-sage text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <Save className="w-3.5 h-3.5" /> Salvar prompt
                  </button>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold text-natural-subtext block mb-2">Prompt de geracao</span>
                  <textarea
                    value={prompt?.composeTemplate || ''}
                    onChange={(e) => setPromptDraft(tema.id, { composeTemplate: e.target.value })}
                    rows={10}
                    className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-xs font-mono"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-natural-subtext block mb-2">Prompt de refino</span>
                  <textarea
                    value={prompt?.refineTemplate || ''}
                    onChange={(e) => setPromptDraft(tema.id, { refineTemplate: e.target.value })}
                    rows={8}
                    className="w-full px-4 py-3 bg-white border border-natural-border rounded-xl text-xs font-mono"
                  />
                </label>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {pageError && (
        <div className="rounded-2xl border border-[#E7C7AF] bg-[#FFF7F2] px-4 py-3 text-sm text-[#9A5B33]">
          {pageError}
        </div>
      )}

      {activeTab === 'pedidos' && (loading ? (
        <div className="py-20 text-center text-natural-subtext">
          <LoaderCircle className="w-8 h-8 animate-spin mx-auto mb-3" />
          Carregando pedidos...
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => {
            const draft = drafts[order.id] || { source1: '', source2: '', referenceUrl1: '', referenceUrl2: '', fileName1: '', fileName2: '' };
            const busy = busyId === order.id;
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-natural-border rounded-3xl p-5 md:p-6 shadow-xs">
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="lg:w-1/3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-natural-dark">{order.id}</span>
                      <span className="text-[10px] uppercase px-2 py-0.5 rounded border bg-natural-sage-light text-natural-subtext">{order.status_producao}</span>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded border ${order.status_pagamento === 'PAGO' ? 'bg-[#EBF5EE] text-[#1B5E20] border-[#C8E6C9]' : 'bg-[#FFF7F2] text-[#9A5B33] border-[#E7C7AF]'}`}>{order.status_pagamento}</span>
                    </div>
                    <p className="text-sm text-natural-dark">{order.cliente_email}</p>
                    <p className="text-sm text-natural-subtext">{order.cliente_whatsapp}</p>
                    <p className="text-xs text-natural-subtext">Tema: {order.respostas.temaId} | Estilo: {order.respostas.estiloMusical}</p>
                    <p className="text-xs text-natural-subtext">Previa 1: {order.url_local_servidor || 'nao anexada'}</p>
                    <p className="text-xs text-natural-subtext">Previa 2: {order.url_local_servidor_2 || 'nao anexada'}</p>
                    <p className="text-xs text-natural-subtext">Comprovante: {order.comprovante_nome_arquivo || 'nao enviado'}</p>
                  </div>

                  <div className="lg:flex-1 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-semibold text-natural-subtext block mb-2">Upload da faixa 1</span>
                        <input
                          type="file"
                          accept=".mp3,.wav,audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(order.id, 'v1', file).catch(console.error);
                          }}
                          className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
                        />
                        {draft.fileName1 && <span className="text-[11px] text-natural-subtext mt-1 block">{draft.fileName1}</span>}
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-natural-subtext block mb-2">Upload da faixa 2</span>
                        <input
                          type="file"
                          accept=".mp3,.wav,audio/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFile(order.id, 'v2', file).catch(console.error);
                          }}
                          className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm"
                        />
                        {draft.fileName2 && <span className="text-[11px] text-natural-subtext mt-1 block">{draft.fileName2}</span>}
                      </label>
                      <input value={draft.referenceUrl1} onChange={(e) => setDraft(order.id, { referenceUrl1: e.target.value })} placeholder="URL de referencia da faixa 1" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                      <input value={draft.referenceUrl2} onChange={(e) => setDraft(order.id, { referenceUrl2: e.target.value })} placeholder="URL de referencia da faixa 2" className="w-full px-4 py-3 bg-[#FAF8F5] border border-natural-border rounded-xl text-sm" />
                    </div>

                    <div className="rounded-2xl border border-[#E7C7AF] bg-[#FFF7F2] px-4 py-3 text-[12px] text-[#9A5B33] leading-relaxed">
                      Para gerar previa sem FFmpeg instalado no servidor, envie as faixas em <strong>WAV</strong>. Se enviar MP3, o servidor vai pedir FFmpeg.
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button type="button" disabled={busy || !order.letra_aprovada} onClick={() => resendTelegram(order.id)} className="px-4 py-3 bg-[#1F7A4D] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <Send className="w-4 h-4" /> Reenviar letra no Telegram
                      </button>
                      <button type="button" disabled={busy || !draft.source1 || !draft.source2} onClick={() => attachAudio(order.id)} className="px-4 py-3 bg-natural-sage text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <Music2 className="w-4 h-4" /> Anexar faixas e gerar previas
                      </button>
                      <button type="button" disabled={busy} onClick={() => markPaid(order.id)} className="px-4 py-3 bg-[#2E7D32] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        <CheckCircle2 className="w-4 h-4" /> Marcar como pago
                      </button>
                      <button type="button" disabled={busy} onClick={() => markUnpaid(order.id)} className="px-4 py-3 bg-[#9A5B33] text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-60">
                        Nao pago
                      </button>
                      <button type="button" disabled={busy} onClick={() => resetAudio(order.id)} className="px-4 py-3 bg-white border border-natural-border rounded-xl text-xs font-bold text-natural-subtext cursor-pointer disabled:opacity-60">
                        Limpar faixas
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
