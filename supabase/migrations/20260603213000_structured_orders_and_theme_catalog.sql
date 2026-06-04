alter table public.pedidos
  add column if not exists cliente_email text,
  add column if not exists cliente_whatsapp text,
  add column if not exists tema_id text,
  add column if not exists estilo_musical text,
  add column if not exists prov_voice text,
  add column if not exists respostas jsonb,
  add column if not exists letra_gerada text,
  add column if not exists letra_aprovada text,
  add column if not exists termo_aceite_assinado boolean not null default false,
  add column if not exists termo_aceite_timestamp timestamptz,
  add column if not exists status_pagamento text,
  add column if not exists status_producao text,
  add column if not exists pix_copia_e_cola text,
  add column if not exists pix_qr_code_url text,
  add column if not exists url_original_suno text,
  add column if not exists url_original_suno_2 text,
  add column if not exists url_referencia_externa_1 text,
  add column if not exists url_referencia_externa_2 text,
  add column if not exists url_local_servidor text,
  add column if not exists url_local_servidor_2 text,
  add column if not exists comprovante_url_local text,
  add column if not exists comprovante_nome_arquivo text,
  add column if not exists data_expiracao_local timestamptz,
  add column if not exists ai_interactions jsonb not null default '[]'::jsonb;

update public.pedidos
set
  cliente_email = coalesce(cliente_email, data->>'cliente_email'),
  cliente_whatsapp = coalesce(cliente_whatsapp, data->>'cliente_whatsapp'),
  tema_id = coalesce(tema_id, data->'respostas'->>'temaId'),
  estilo_musical = coalesce(estilo_musical, data->'respostas'->>'estiloMusical'),
  prov_voice = coalesce(prov_voice, data->'respostas'->>'provVoice'),
  respostas = coalesce(respostas, data->'respostas'->'respostas'),
  letra_gerada = coalesce(letra_gerada, data->>'letra_gerada'),
  letra_aprovada = coalesce(letra_aprovada, data->>'letra_aprovada'),
  termo_aceite_assinado = coalesce(termo_aceite_assinado, coalesce((data->>'termo_aceite_assinado')::boolean, false)),
  termo_aceite_timestamp = coalesce(termo_aceite_timestamp, nullif(data->>'termo_aceite_timestamp', '')::timestamptz),
  status_pagamento = coalesce(status_pagamento, data->>'status_pagamento'),
  status_producao = coalesce(status_producao, data->>'status_producao'),
  pix_copia_e_cola = coalesce(pix_copia_e_cola, data->>'pix_copia_e_cola'),
  pix_qr_code_url = coalesce(pix_qr_code_url, data->>'pix_qr_code_url'),
  url_original_suno = coalesce(url_original_suno, data->>'url_original_suno'),
  url_original_suno_2 = coalesce(url_original_suno_2, data->>'url_original_suno_2'),
  url_referencia_externa_1 = coalesce(url_referencia_externa_1, data->>'url_referencia_externa_1'),
  url_referencia_externa_2 = coalesce(url_referencia_externa_2, data->>'url_referencia_externa_2'),
  url_local_servidor = coalesce(url_local_servidor, data->>'url_local_servidor'),
  url_local_servidor_2 = coalesce(url_local_servidor_2, data->>'url_local_servidor_2'),
  comprovante_url_local = coalesce(comprovante_url_local, data->>'comprovante_url_local'),
  comprovante_nome_arquivo = coalesce(comprovante_nome_arquivo, data->>'comprovante_nome_arquivo'),
  data_expiracao_local = coalesce(data_expiracao_local, nullif(data->>'data_expiracao_local', '')::timestamptz),
  ai_interactions = coalesce(ai_interactions, coalesce(data->'ai_interactions', '[]'::jsonb));

create index if not exists pedidos_tema_id_idx on public.pedidos (tema_id);
create index if not exists pedidos_status_pagamento_idx on public.pedidos (status_pagamento);
create index if not exists pedidos_status_producao_idx on public.pedidos (status_producao);
create index if not exists pedidos_estilo_musical_idx on public.pedidos (estilo_musical);
create index if not exists pedidos_cliente_email_structured_idx on public.pedidos (lower(cliente_email));
create index if not exists pedidos_cliente_whatsapp_structured_idx on public.pedidos (cliente_whatsapp);

create table if not exists public.song_themes (
  id text primary key,
  title text not null,
  description text not null default '',
  emoji text not null default '🎵',
  bg_color text not null default 'from-stone-200/40 to-stone-300/20',
  color text not null default 'stone',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.theme_questions (
  theme_id text not null references public.song_themes(id) on delete cascade,
  question_id text not null,
  label text not null,
  placeholder text not null default '',
  description text,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (theme_id, question_id)
);

alter table public.song_themes enable row level security;
alter table public.theme_questions enable row level security;

drop policy if exists "song_themes_service_role_all" on public.song_themes;
create policy "song_themes_service_role_all"
on public.song_themes
for all
to service_role
using (true)
with check (true);

drop policy if exists "theme_questions_service_role_all" on public.theme_questions;
create policy "theme_questions_service_role_all"
on public.theme_questions
for all
to service_role
using (true)
with check (true);

insert into public.song_themes (id, title, description, emoji, bg_color, color, sort_order, is_active)
values
  ('romantica', 'Romantica', 'Para o amor da sua vida (esposa, esposo, namorados).', '💖', 'from-rose-500/10 to-pink-500/10', 'rose', 0, true),
  ('mae', 'Mae Corujinha', 'Homenagem cheia de afeto e gratidao para sua mae.', '🌸', 'from-fuchsia-500/10 to-purple-500/10', 'fuchsia', 1, true),
  ('pai', 'Heroi Pai', 'Uma homenagem emocionante para o seu pai, parceiro e heroi.', '👔', 'from-blue-500/10 to-cyan-500/10', 'blue', 2, true),
  ('filho', 'Filho(a) Amado(a)', 'Uma homenagem profunda para celebrar o amor, o orgulho e a presenca de um filho ou filha.', '🧸', 'from-emerald-500/10 to-lime-500/10', 'emerald', 3, true),
  ('debutante', '15 Anos (Debutante)', 'A transicao especial de menina para mulher em formato de musica.', '👑', 'from-amber-500/10 to-orange-500/10', 'amber', 4, true),
  ('amizade', 'Amizade de Ouro', 'Para celebrar conexoes verdadeiras, viagens, risadas e cumplicidade.', '🍻', 'from-teal-500/10 to-emerald-500/10', 'teal', 5, true),
  ('revelacao', 'Cha Revelacao', 'A doce espera de uma nova vida: revelacao do nome e muito amor.', '🍼', 'from-violet-500/10 to-indigo-500/10', 'violet', 6, true)
on conflict (id) do update
set
  title = excluded.title,
  description = excluded.description,
  emoji = excluded.emoji,
  bg_color = excluded.bg_color,
  color = excluded.color,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());

insert into public.theme_questions (theme_id, question_id, label, placeholder, description, sort_order, is_required, is_active)
values
  ('romantica', 'p1', 'Qual o nome do casal (seu nome e o nome dela/dele)?', 'Ex: Arthur e Sofia', null, 0, true, true),
  ('romantica', 'p2', 'Qual a data de inicio do relacionamento e a data do casamento (se houver)?', 'Ex: Comecamos a namorar em 12/04/2018 e nos casamos em 20/11/2022', null, 1, true, true),
  ('romantica', 'p3', 'Como e onde voces se conheceram? Deixe um detalhe marcante ou engracado desse dia.', 'Ex: Nos conhecemos num dia chuvoso na parada de onibus da faculdade, dividi o guarda-chuva.', null, 2, true, true),
  ('romantica', 'p4', 'Quais sao as principais qualidades dele(a) que te fazem se apaixonar todos os dias?', 'Ex: O sorriso contagiante, a paciencia dela e o jeito que ela cuida de todo mundo.', null, 3, true, true),
  ('romantica', 'p5', 'Cite 2 ou 3 momentos inesqueciveis que viveram juntos (viagens, superacoes, conquistas).', 'Ex: Nossa viagem para Gramado, quando adotamos nosso cachorrinho e quando compramos nosso apartamento.', null, 4, true, true),
  ('romantica', 'p6', 'Voces tem apelidos carinhosos, piadas internas ou manias que so voces entendem? Quais?', 'Ex: Eu a chamo de Pipoca e ela me chama de Urso. Ela morde o copo quando bebe refrigerante.', null, 5, true, true),
  ('mae', 'p1', 'Qual o nome da sua mae e qual o apelido carinhoso que voce a chama?', 'Ex: Maria Helena, tambem chamada de Rainha ou Mainha', null, 0, true, true),
  ('mae', 'p2', 'Quais sao as frases, ensinamentos ou conselhos que ela sempre te diz e que voce leva para a vida?', 'Ex: "Deus ajuda quem cedo madruga" e "Nunca se esqueca de onde voce veio".', null, 1, true, true),
  ('mae', 'p3', 'Qual a maior licao de resiliencia, amor ou sacrificio que voce viu ela fazer pela familia?', 'Ex: Ela trabalhava em dois empregos para garantir que nunca faltassem livros e estudos para nos.', null, 2, true, true),
  ('mae', 'p4', 'Qual lembranca da infancia ou cheiro/comida te faz lembrar imediatamente do lar que ela construiu?', 'Ex: O cheirinho de bolo de cenoura com cobertura de chocolate saindo do forno nas tardes de domingo.', null, 3, true, true),
  ('mae', 'p5', 'O que voce mais deseja agradecer e declarar para ela atraves dessa musica?', 'Ex: Quero agradecer por ser meu porto seguro e dizer que tudo o que sou hoje devo a ela.', null, 4, true, true),
  ('pai', 'p1', 'Qual o nome do seu pai e como a familia o chama?', 'Ex: Francisco Carlos, mas todos chamam de Chico ou Painho', null, 0, true, true),
  ('pai', 'p2', 'Qual o passatempo favorito dele ou aquela mania engracada que ele tem?', 'Ex: Ele ama fazer churrasco ouvindo sertanejo raiz e conserta tudo em casa com fita isolante.', null, 1, true, true),
  ('pai', 'p3', 'Qual foi o conselho mais valioso ou a conversa mais marcante que voce teve com ele?', 'Ex: Ele me disse na garagem que o carater de um homem e medido pela honestidade na dificuldade.', null, 2, true, true),
  ('pai', 'p4', 'Conte uma historia de protecao, parceria ou um momento em que voce sentiu muito orgulho dele.', 'Ex: Quando ele passou a noite inteira em claro me ajudando a pintar meu primeiro carro antigo.', null, 3, true, true),
  ('pai', 'p5', 'Se pudesse definir a personalidade dele em 3 palavras, quais seriam?', 'Ex: Batalhador, brincalhao e firme', null, 4, true, true),
  ('filho', 'p1', 'Qual o nome do seu filho ou filha e como voce costuma chama-lo(a) com carinho?', 'Ex: Davi, meu campeao / Maria Clara, minha princesinha', null, 0, true, true),
  ('filho', 'p2', 'Como foi a chegada dele(a) na sua vida ou qual momento marcou o inicio dessa historia entre voces?', 'Ex: O nascimento dele mudou completamente meu mundo e me ensinou um amor que eu nunca tinha sentido.', null, 1, true, true),
  ('filho', 'p3', 'Quais qualidades, jeitos ou atitudes dele(a) mais enchem seu coracao de orgulho?', 'Ex: O sorriso doce, a coragem para aprender e o jeito carinhoso com toda a familia.', null, 2, true, true),
  ('filho', 'p4', 'Conte um momento inesquecivel ou emocionante que voce viveu com ele(a).', 'Ex: Os primeiros passos, o primeiro dia na escola, um abraco num dia dificil ou uma oracao que me marcou.', null, 3, true, true),
  ('filho', 'p5', 'Quais sonhos, desejos ou mensagens do seu coracao voce quer declarar para o futuro dele(a)?', 'Ex: Quero que ele saiba que sempre tera meu apoio, que seja forte, feliz e nunca esqueca o quanto e amado.', null, 4, true, true),
  ('filho', 'p6', 'Voces tem apelidos, brincadeiras, manias ou pequenos detalhes que so voces entendem?', 'Ex: Chamo ela de estrelinha, dancamos juntos na sala e sempre rimos quando ela inventa palavras.', null, 5, true, true),
  ('debutante', 'p1', 'Qual o nome da debutante e a data da festa/nascimento?', 'Ex: Isabella, festa no dia 15/08/2026', null, 0, true, true),
  ('debutante', 'p2', 'Como os pais descrevem a transicao dela de menina para jovem mulher? Quais os maiores orgulhos?', 'Ex: Dedicada, inteligente, companheira, que ilumina todo lugar por onde passa.', null, 1, true, true),
  ('debutante', 'p3', 'Quais sao os principais hobbies dela (danca, maquiagem, leitura, esportes, redes sociais)?', 'Ex: Ela ama dancar ballet, ler romances de fantasia e gravar videos de maquiagem.', null, 2, true, true),
  ('debutante', 'p4', 'Quais sao os maiores sonhos e planos que ela tem para o futuro?', 'Ex: Ela sonha em estudar medicina veterinaria para cuidar de cavalos e fazer intercambio.', null, 3, true, true),
  ('debutante', 'p5', 'Lembre um fato engracado ou fofo da infancia dela que a familia guarda com carinho.', 'Ex: Quando ela usava os sapatos de salto alto da mae para dar "aula" para os ursinhos de pelucia.', null, 4, true, true),
  ('amizade', 'p1', 'Qual o nome dos amigos ou do grupo de amigos envolvidos nessa historia?', 'Ex: Rodrigo, Gustavo e Gabriel (o Trio Relampago)', null, 0, true, true),
  ('amizade', 'p2', 'Como e ha quanto tempo essa amizade comecou? Onde se conheceram?', 'Ex: Comecou ha 10 anos, nos conhecemos na escola jogando futebol na hora do recreio.', null, 1, true, true),
  ('amizade', 'p3', 'Quais sao os principais roles, viagens, aventuras ou loucuras que voces ja dividiram?', 'Ex: Nossa viagem de mochilao para o Rio de Janeiro e quando ficamos sem gasolina na serra.', null, 2, true, true),
  ('amizade', 'p4', 'Conte uma situacao marcante em que a presenca desse amigo fez toda a diferenca.', 'Ex: Quando o Gustavo me ajudou na mudanca de estado de surpresa, sem eu pedir.', null, 3, true, true),
  ('amizade', 'p5', 'Quais sao as manias internas, piadas de grupo, apelidos ou expressoes engracadas que so voces entendem?', 'Ex: Falamos "e os guri" para tudo, apelido de "Prego" do Gabriel, e a mania de rir alto.', null, 4, true, true),
  ('revelacao', 'p1', 'Qual o nome dos pais do bebe?', 'Ex: Juliana e Renato', null, 0, true, true),
  ('revelacao', 'p2', 'Como foi a descoberta da gravidez e como esta a ansiedade pela espera?', 'Ex: Descobrimos no teste de farmacia numa terca de manha. A ansiedade esta mil por hora.', null, 1, true, true),
  ('revelacao', 'p3', 'Quais sao os palpites da familia? Ha alguma brincadeira sobre isso?', 'Ex: A avo jura que e menina por causa do formato da barriga, mas o pai acha que e o capitao do time.', null, 2, true, true),
  ('revelacao', 'p4', 'Deixe uma mensagem de amor sobre como esse bebe ja e amado antes mesmo de nascer.', 'Ex: Voce e nossa maior promessa, nossa casa e nossos coracoes ja estao prontos para voce.', null, 3, true, true),
  ('revelacao', 'p5', 'Qual e o nome do bebe caso seja menino e qual o nome caso seja menina?', 'Ex: Se for menino se chamara Teo, se for menina se chamara Livia.', null, 4, true, true)
on conflict (theme_id, question_id) do update
set
  label = excluded.label,
  placeholder = excluded.placeholder,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_required = excluded.is_required,
  is_active = excluded.is_active,
  updated_at = timezone('utc', now());
