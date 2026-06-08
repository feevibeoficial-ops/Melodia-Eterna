import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TemaConfig, RespostasFormulario } from '../types';
import { ArrowLeft, ArrowRight, Mail, Mic, MicOff, Music, Phone, Sparkles, User } from 'lucide-react';

interface QuestionsFormProps {
  theme: TemaConfig;
  initialData?: RespostasFormulario | null;
  initialSelectedGenderForRevelacao?: 'menino' | 'menina';
  onBack: () => void;
  onSubmit: (data: RespostasFormulario, extraOptions?: { selectedGenderForRevelacao?: 'menino' | 'menina' }) => void;
}

function parseRevealBabyNames(value: string | undefined) {
  const raw = value || '';
  const boyMatch = raw.match(/menino\s*(?:Ã©|e|:)\s*([^\n\r]+)/i);
  const girlMatch = raw.match(/menina\s*(?:Ã©|e|:)\s*([^\n\r]+)/i);
  return {
    menino: boyMatch?.[1]?.trim() || '',
    menina: girlMatch?.[1]?.trim() || '',
  };
}

function parseRevealParentNames(value: string | undefined) {
  const raw = value || '';
  const fatherMatch = raw.match(/pai\s*(?::|e|Ã©|é)\s*([^\n\r]+)/i);
  const motherMatch = raw.match(/m(?:a|ã|Ã£)e\s*(?::|e|Ã©|é)\s*([^\n\r]+)/i);
  const splitNames = raw.split(/\s+e\s+/i).map((item) => item.trim()).filter(Boolean);

  return {
    pai: fatherMatch?.[1]?.trim() || splitNames[1] || '',
    mae: motherMatch?.[1]?.trim() || splitNames[0] || '',
  };
}

function formatBrazilianWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 13);
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;

  if (withoutCountry.length <= 2) return withoutCountry;
  if (withoutCountry.length <= 7) return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2)}`;
  if (withoutCountry.length <= 10) return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 6)}-${withoutCountry.slice(6)}`;
  return `(${withoutCountry.slice(0, 2)}) ${withoutCountry.slice(2, 7)}-${withoutCountry.slice(7, 11)}`;
}

function normalizeBrazilianWhatsApp(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

export default function QuestionsForm({ theme, initialData, initialSelectedGenderForRevelacao, onBack, onSubmit }: QuestionsFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    theme.perguntas.filter((q) => q.isActive !== false).forEach((q) => {
      initial[q.id] = initialData?.respostas?.[q.id] || '';
    });
    return initial;
  });
  const [revealParentNames, setRevealParentNames] = useState(() => parseRevealParentNames(initialData?.respostas?.p1));
  const [revealBabyNames, setRevealBabyNames] = useState(() => parseRevealBabyNames(initialData?.respostas?.p5));
  const [estiloMusical, setEstiloMusical] = useState(initialData?.estiloMusical || 'RomÃ¢ntico');
  const [provVoice, setProvVoice] = useState(initialData?.provVoice || 'indiferente');
  const [clienteEmail, setClienteEmail] = useState(initialData?.clienteEmail || '');
  const [clienteWhatsapp, setClienteWhatsapp] = useState(formatBrazilianWhatsApp(initialData?.clienteWhatsapp || ''));
  const [selectedGenderForRevelacao, setSelectedGenderForRevelacao] = useState<'menino' | 'menina'>(initialSelectedGenderForRevelacao || 'menino');
  const [recordingFieldId, setRecordingFieldId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const ESTILOS = [
    'RomÃ¢ntico', 'Sertanejo', 'Pop', 'MPB', 'Pagode',
    'ForrÃ³', 'Gospel', 'Rock', 'Reggae', 'EletrÃ´nico', 'Jazz', 'Infantil'
  ];

  const VOZES = [
    { value: 'feminina', label: 'Voz Feminina', desc: 'MelÃ³dica, vibrante e cheia de afeto' },
    { value: 'masculina', label: 'Voz Masculina', desc: 'Encorajadora, firme e nostÃ¡lgica' },
    { value: 'indiferente', label: 'Sem PreferÃªncia', desc: 'Deixar sob escolha de nosso compositor' }
  ];

  const handleInputChange = (fieldId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleRevealParentNameChange = (field: 'pai' | 'mae', value: string) => {
    setRevealParentNames((prev) => {
      const next = { ...prev, [field]: value };
      setAnswers((current) => ({
        ...current,
        p1: `Pai: ${next.pai.trim()}\nMae: ${next.mae.trim()}`.trim(),
      }));
      return next;
    });
  };

  const handleRevealBabyNameChange = (field: 'menino' | 'menina', value: string) => {
    setRevealBabyNames((prev) => {
      const next = { ...prev, [field]: value };
      setAnswers((current) => ({
        ...current,
        p5: `Menino Ã© ${next.menino.trim()}\nMenina Ã© ${next.menina.trim()}`.trim(),
      }));
      return next;
    });
  };

  const toggleRecording = (fieldId: string) => {
    if (recordingFieldId === fieldId) {
      stopRecording();
      return;
    }

    if (recordingFieldId) {
      stopRecording();
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Seu navegador nÃ£o oferece suporte nativo Ã  gravaÃ§Ã£o de voz. Use o Chrome ou digite normalmente.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => setRecordingFieldId(fieldId);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setAnswers((prev) => {
            const currentVal = prev[fieldId] ? `${prev[fieldId].trim()} ` : '';
            return { ...prev, [fieldId]: currentVal + transcript };
          });
        }
      };
      recognition.onerror = (err: any) => {
        console.error('Erro de reconhecimento de fala:', err);
        stopRecording();
      };
      recognition.onend = () => setRecordingFieldId(null);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setRecordingFieldId(null);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error(e);
      }
    }
    setRecordingFieldId(null);
  };

  const isThemeQuestionsValid = () => {
    if (theme.id === 'revelacao') {
      if (!revealParentNames.pai.trim() || !revealParentNames.mae.trim()) {
        return false;
      }
      if (!revealBabyNames.menino.trim() || !revealBabyNames.menina.trim()) {
        return false;
      }
    }

    return theme.perguntas
      .filter((q) => q.isActive !== false && q.isRequired !== false)
      .every((q) => answers[q.id] && answers[q.id].trim().length > 1);
  };

  const isContactValid = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneDigits = normalizeBrazilianWhatsApp(clienteWhatsapp).replace(/[^\d]/g, '');
    return emailRegex.test(clienteEmail) && phoneDigits.length >= 12;
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!isThemeQuestionsValid()) {
        alert('Por favor, preencha todos os campos do questionÃ¡rio antes de avanÃ§ar.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const handleFinalSubmit = () => {
    if (!isContactValid()) {
      alert('Por favor, digite um e-mail vÃ¡lido e um nÃºmero de WhatsApp completo com DDD.');
      return;
    }

    const payload: RespostasFormulario = {
      temaId: theme.id,
      respostas: answers,
      estiloMusical,
      provVoice,
      clienteEmail,
      clienteWhatsapp: normalizeBrazilianWhatsApp(clienteWhatsapp),
    };

    onSubmit(payload, theme.id === 'revelacao' ? { selectedGenderForRevelacao } : undefined);
  };

  return (
    <div id="questions-form-root" className="max-w-2xl mx-auto px-4 py-8 bg-white border border-natural-border rounded-3xl shadow-xs">
      <div className="flex justify-between items-center mb-8 border-b border-natural-border pb-4">
        <button
          onClick={step === 1 ? onBack : handlePrevStep}
          className="flex items-center gap-1.5 text-xs font-semibold text-natural-subtext hover:text-natural-dark transition-colors uppercase tracking-wider cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Voltar
        </button>

        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 1 ? 'bg-natural-sage scale-110' : 'bg-natural-border'}`} />
          <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 2 ? 'bg-natural-sage scale-110' : 'bg-natural-border'}`} />
          <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 3 ? 'bg-natural-sage scale-110' : 'bg-natural-border'}`} />
        </div>

        <span className="text-xs font-semibold text-natural-subtext uppercase tracking-widest">
          Passo {step} de 3
        </span>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <div className="text-3xl mb-1">{theme.emoji}</div>
              <h2 className="text-2xl font-bold font-display text-natural-dark leading-tight">
                Conte-nos sobre essa histÃ³ria {theme.id === 'romantica' ? 'de Amor' : `de ${theme.titulo}`}
              </h2>
              <p className="text-sm text-natural-subtext mt-1">
                Suas lembranÃ§as e detalhes darÃ£o alma, verdade e rimas Ãºnicas Ã  canÃ§Ã£o.
              </p>
            </div>

            <div className="space-y-5">
              {theme.perguntas.filter((q) => q.isActive !== false).map((q) => (
                <div key={q.id} className="space-y-2">
                  <label className="text-sm font-semibold text-natural-dark flex justify-between items-center">
                    <span>{q.label}</span>
                    {q.isRequired !== false && <span className="text-xs text-natural-caramel font-light font-sans">* obrigatÃ³rio</span>}
                  </label>

                  {theme.id === 'revelacao' && q.id === 'p1' ? (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-natural-subtext">Pai</span>
                        <input
                          type="text"
                          value={revealParentNames.pai}
                          onChange={(e) => handleRevealParentNameChange('pai', e.target.value)}
                          placeholder="Ex: Renato"
                          className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark"
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-natural-subtext">Mae</span>
                        <input
                          type="text"
                          value={revealParentNames.mae}
                          onChange={(e) => handleRevealParentNameChange('mae', e.target.value)}
                          placeholder="Ex: Juliana"
                          className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark"
                        />
                      </div>
                    </div>
                  ) : theme.id === 'revelacao' && q.id === 'p5' ? (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-natural-subtext">Menino</span>
                        <input
                          type="text"
                          value={revealBabyNames.menino}
                          onChange={(e) => handleRevealBabyNameChange('menino', e.target.value)}
                          placeholder="Ex: Azael"
                          className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark"
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-natural-subtext">Menina</span>
                        <input
                          type="text"
                          value={revealBabyNames.menina}
                          onChange={(e) => handleRevealBabyNameChange('menina', e.target.value)}
                          placeholder="Ex: Stella"
                          className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <textarea
                        value={answers[q.id] || ''}
                        onChange={(e) => handleInputChange(q.id, e.target.value)}
                        placeholder={q.p_placeholder}
                        rows={3}
                        className="w-full px-4 py-3 pb-11 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white resize-none transition-all leading-relaxed font-light text-natural-dark"
                      />

                      <button
                        type="button"
                        onClick={() => toggleRecording(q.id)}
                        className={`absolute bottom-3 right-3 p-2 rounded-lg transition-all duration-200 cursor-pointer flex items-center gap-1 text-xs border ${
                          recordingFieldId === q.id
                            ? 'bg-natural-dark border-natural-dark text-white animate-pulse'
                            : 'bg-white hover:bg-natural-sage-light border-natural-border text-natural-dark'
                        }`}
                        title={recordingFieldId === q.id ? 'Parar gravaÃ§Ã£o' : 'Gravar por voz'}
                      >
                        {recordingFieldId === q.id ? (
                          <>
                            <MicOff className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-sans font-medium">Gravando...</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-3.5 h-3.5 text-natural-sage" />
                            <span className="text-[10px] font-sans font-medium text-natural-subtext">Falar</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {theme.id === 'revelacao' && (
              <div className="p-4 bg-natural-sage-light border border-natural-border rounded-2xl md:p-5 mt-6 space-y-3">
                <div className="flex items-center gap-1.5 text-natural-dark font-medium text-sm">
                  <Sparkles className="w-4 h-4 text-natural-sage" />
                  <span>Simulador de RevelaÃ§Ã£o para VisualizaÃ§Ã£o</span>
                </div>
                <p className="text-xs text-natural-subtext leading-relaxed font-light">
                  Selecione qual serÃ¡ o sexo revelado no chÃ¡ para compormos a letra com o nome correto.
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedGenderForRevelacao('menino')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold uppercase border transition-all cursor-pointer ${
                      selectedGenderForRevelacao === 'menino'
                        ? 'bg-[#4A7A8C] border-[#3D697A] text-white shadow-xs'
                        : 'bg-white border-natural-border hover:bg-natural-sage-light text-natural-dark'
                    }`}
                  >
                    ðŸ‘¦ Menino ({revealBabyNames.menino || 'sem nome'})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGenderForRevelacao('menina')}
                    className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold uppercase border transition-all cursor-pointer ${
                      selectedGenderForRevelacao === 'menina'
                        ? 'bg-[#B46D7D] border-[#9D5969] text-white shadow-xs'
                        : 'bg-white border-natural-border hover:bg-natural-sage-light text-natural-dark'
                    }`}
                  >
                    ðŸ‘§ Menina ({revealBabyNames.menina || 'sem nome'})
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleNextStep}
              className="w-full mt-6 py-3 px-5 bg-natural-sage hover:bg-natural-sage/90 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              AvanÃ§ar PreferÃªncias <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <Music className="w-8 h-8 text-natural-sage mb-2" />
              <h2 className="text-2xl font-bold font-display text-natural-dark leading-tight">
                Estilo Musical e Identidade Vocal
              </h2>
              <p className="text-sm text-natural-subtext mt-1">
                Escolha a roupagem perfeita que ditarÃ¡ o ritmo e a harmonia da canÃ§Ã£o.
              </p>
            </div>

            <div className="space-y-4">
              <label className="text-sm font-semibold text-natural-dark">
                Qual estilo combina mais? *
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ESTILOS.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setEstiloMusical(style)}
                    className={`py-3 px-4 rounded-xl text-xs font-medium border text-center transition-all cursor-pointer ${
                      estiloMusical === style
                        ? 'bg-natural-sage/10 border-natural-sage text-natural-dark shadow-3xs font-semibold scale-[1.02]'
                        : 'bg-natural-sage-light border-natural-border hover:bg-white text-natural-subtext font-light'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <label className="text-sm font-semibold text-natural-dark block">
                Qual timbre de voz Ã© o ideal?
              </label>

              <div className="space-y-3">
                {VOZES.map((v) => (
                  <div
                    key={v.value}
                    onClick={() => setProvVoice(v.value)}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      provVoice === v.value
                        ? 'bg-natural-sage-light border-natural-sage shadow-3xs'
                        : 'bg-transparent border-natural-border hover:bg-natural-sage-light/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${provVoice === v.value ? 'border-natural-sage bg-natural-sage' : 'border-natural-border bg-white'}`}>
                        {provVoice === v.value && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-natural-dark">{v.label}</h4>
                        <p className="text-xs text-natural-subtext font-light mt-0.5">{v.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleNextStep}
              className="w-full mt-6 py-3 px-5 bg-natural-sage hover:bg-natural-sage/90 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              AvanÃ§ar Contato <ArrowRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div>
              <User className="w-8 h-8 text-natural-sage mb-2" />
              <h2 className="text-2xl font-bold font-display text-natural-dark leading-tight">
                Dados de Contato
              </h2>
              <p className="text-sm text-natural-subtext mt-1">
                NecessÃ¡rios para localizar suas canÃ§Ãµes ou enviar alertas importantes de conclusÃ£o.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-natural-sage" /> E-mail de PreferÃªncia *
                </label>
                <input
                  type="email"
                  value={clienteEmail}
                  onChange={(e) => setClienteEmail(e.target.value)}
                  placeholder="Seu melhor e-mail (Ex: thales@email.com)"
                  className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark font-light"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-natural-subtext flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-natural-sage" /> WhatsApp / Celular *
                </label>
                <input
                  type="tel"
                  value={clienteWhatsapp}
                  onChange={(e) => setClienteWhatsapp(formatBrazilianWhatsApp(e.target.value))}
                  placeholder="DDD + numero (Ex: 11 99999-8888)"
                  className="w-full px-4 py-3 bg-natural-sage-light border border-natural-border rounded-xl text-sm focus:outline-hidden focus:border-natural-sage focus:bg-white transition-all text-natural-dark font-light"
                />
              </div>
            </div>

            <button
              onClick={handleFinalSubmit}
              className="w-full mt-6 py-3 px-5 bg-natural-sage hover:bg-natural-sage/95 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              Enviar Para Nossa Equipe Criativa <Sparkles className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
