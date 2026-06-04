import { motion } from 'motion/react';
import { TemaConfig } from '../types';
import { ArrowRight, Music, Search } from 'lucide-react';

interface ThemeSelectorProps {
  themes: TemaConfig[];
  onSelectTheme: (theme: TemaConfig) => void;
  onGoToSearch: () => void;
}

export default function ThemeSelector({ themes, onSelectTheme, onGoToSearch }: ThemeSelectorProps) {
  return (
    <div id="theme-selector-root" className="max-w-5xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3 py-1 bg-white/80 text-natural-sage rounded-full text-xs font-semibold mb-3 tracking-wide uppercase border border-natural-border shadow-xs"
        >
          <Music className="w-3.5 h-3.5" /> Melodia Eterna
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-4xl md:text-5xl font-bold font-display tracking-tight text-natural-dark mb-4"
        >
          Transforme Sua História em Uma <span className="text-natural-sage font-display italic">Música Real</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-natural-subtext max-w-xl mx-auto text-base md:text-lg font-light leading-relaxed"
        >
          Escreva ou conte sua história para que nossos compositores criem uma letra única e nossos produtores transformem tudo em uma música inesquecível.
        </motion.p>
      </div>

      <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mb-12">
        <button
          type="button"
          onClick={onGoToSearch}
          className="flex items-center gap-2 px-6 py-3 bg-white hover:bg-natural-sage-light text-natural-dark font-medium rounded-xl border border-natural-border shadow-xs transition-all text-sm w-full sm:w-auto justify-center cursor-pointer"
        >
          <Search className="w-4 h-4 text-natural-sage" />
          Minhas Músicas Anteriores
        </button>
      </div>

      <h2 className="text-sm font-semibold tracking-wider text-natural-subtext text-center uppercase mb-6 font-sans">
        Escolha um Tema para Começar
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {themes.map((theme, idx) => (
          <motion.div
            key={theme.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: idx * 0.05 }}
            onClick={() => onSelectTheme(theme)}
            className="group relative bg-white/88 backdrop-blur-[2px] p-6 rounded-2xl border border-natural-border shadow-xs hover:shadow-md hover:border-natural-sage cursor-pointer overflow-hidden transition-all flex flex-col justify-between"
          >
            <div className="absolute inset-0 bg-natural-sage-light opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

            <div className="relative z-10">
              <span className="text-4xl mb-4 block filter drop-shadow-xs group-hover:scale-110 transition-transform duration-300">
                {theme.emoji}
              </span>
              <h3 className="text-xl font-bold text-natural-dark font-display mb-2 group-hover:text-natural-sage transition-colors">
                {theme.titulo}
              </h3>
              <p className="text-sm text-natural-subtext leading-relaxed font-light mb-6">
                {theme.descricao}
              </p>
            </div>

            <div className="relative z-10 flex items-center justify-between text-xs font-semibold text-natural-dark border-t border-natural-border pt-4 group-hover:text-natural-sage transition-colors">
              <span>Criar composição</span>
              <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
