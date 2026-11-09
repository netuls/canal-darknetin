// Função do Vercel: gera o roteiro de um Short com IA (Google Gemini, plano gratuito).
// Variáveis de ambiente no Vercel: GEMINI_API_KEY e APP_SENHA
// Se o modelo sair do ar, veja o nome atual em aistudio.google.com e troque aqui.
// Tenta cada modelo em ordem; se um não responder em 20 s ou não existir, passa para o próximo.
const MODELOS = [process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ erro: "GEMINI_API_KEY não configurada no Vercel" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const { tema = "", assunto = "", duracao = 45, tom = "misterioso", modo = "", titulo = "", texto = "", estilo = "escuro", jaUsados = [] } = req.body || {};
  const infantil = estilo === "infantil";
  const emocional = estilo === "emocional";
  const pick = (dark, kids, emo) => infantil ? kids : emocional ? emo : dark;
  const usados = (Array.isArray(jaUsados) ? jaUsados : []).map(x => String(x).slice(0, 140)).filter(Boolean).slice(-200);
  const dur = Math.min(Math.max(Number(duracao) || 45, 15), 60);
  const palavras = Math.round(dur * 2.3);
  const tipoCanal = pick("canal dark", "canal infantil (crianças pequenas e seus pais)", "canal de histórias emocionantes sobre amizade e laços de família (público geral)");
  const gancho = pick(
    "o 1º parágrafo é uma única frase curta (até ~12 palavras), agressiva e impossível de ignorar, que gera curiosidade ou choque. Proibido começar com saudação, apresentação, \"neste vídeo\", contexto ou data solta.",
    "o 1º parágrafo é uma única frase curta (até ~12 palavras), animada e cheia de curiosidade (uma pergunta divertida ou algo surpreendente e fofo). Proibido começar com saudação, apresentação ou \"neste vídeo\".",
    "o 1º parágrafo é uma única frase curta (até ~12 palavras) que toca o coração ou gera curiosidade emocional, com uma cena específica e inesperada (ex.: um detalhe pequeno que revela muito). Proibido começar com saudação, apresentação ou \"neste vídeo\".");
  const img1 = pick("a mais impactante e chocante visualmente do vídeo", "a mais colorida e chamativa do vídeo", "a mais emotiva e bonita visualmente do vídeo");
  const ritmo = pick("aumenta a tensão", "mantém a diversão e a curiosidade", "aumenta a emoção");
  const final = pick(
    "não resolva tudo. Termine com uma pergunta ou um detalhe inquietante que deixe a sensação de \"preciso ver de novo\" e convide a comentar. A última frase deve poder emendar naturalmente com a primeira (efeito de loop).",
    "termine com uma pergunta divertida ou um convite para a criança imaginar ou repetir algo (NÃO peça comentários: vídeos para crianças têm comentários desativados). A última frase deve poder emendar com a primeira (efeito de loop).",
    "termine com uma frase que fique no coração ou uma pergunta reflexiva que faça o espectador lembrar de alguém (pode convidar a contar nos comentários quem é essa pessoa). A última frase deve poder emendar com a primeira (efeito de loop).");
  const regrasExtra = pick(`
- Só fatos plausíveis e verificáveis; não invente dados.`, `
- SEGURANÇA INFANTIL: linguagem simples e positiva, sem violência, sem sustos ou medo, sem conteúdo adulto, sem propaganda. Use só personagens ORIGINAIS (animais, criaturas fofas, crianças de desenho) e NUNCA personagens, marcas, estúdios ou músicas protegidos por direitos autorais.
- Se o tema for educativo, só fatos corretos e simples; se for história ou fábula, crie uma história original com começo, meio e fim curto.`, `
- HISTÓRIA ORIGINAL e universal, contada como ficção (ex.: "Era uma vez...", "Imagine...") ou como situação comum. NUNCA afirme que aconteceu de verdade, não cite pessoas reais nem invente estatísticas.
- Emoção sincera e específica (um gesto, um objeto, uma frase dita), sem melodrama exagerado, sem tragédias gráficas e sem conteúdo adulto. Os personagens têm nomes simples e uma aparência bem definida.`);
  const regraImagem = pick(
    `"imagem": um prompt em inglês para gerar a foto (cinematográfica, vertical 9:16, sem texto na imagem, sem pessoas reais identificáveis). Esse prompt deve descrever só o visual neutro da cena (lugar, objetos, clima, época) e NUNCA conter nomes de grupos políticos, regimes, símbolos, guerras, armas, sangue, corpos ou personagens reais, porque os geradores de imagem bloqueiam esses termos (ex.: em vez de "navio nazista dos anos 1930", escreva "old 1930s steam research vessel in rough sea, black and white archival photo look").`,
    `"imagem": um prompt em inglês para gerar a imagem em estilo de animação ou ilustração infantil colorida (cores vivas, luz suave), vertical 9:16, sem texto, sem pessoas reais. Descreva os MESMOS personagens com a mesma aparência (cor, roupa, formato) em todos os prompts, para manter consistência. Nunca cite personagens, marcas ou estúdios existentes.`,
    `"imagem": um prompt em inglês para gerar uma ilustração emotiva em estilo de livro ilustrado ou animação (luz dourada, cores quentes, composição cinematográfica), vertical 9:16, sem texto, sem pessoas reais. Descreva os MESMOS personagens com a mesma aparência (ex.: "a boy with curly brown hair and a yellow raincoat") em todos os prompts, para manter consistência. Nunca cite personagens, marcas ou estúdios existentes.`);
  const bloqueio = usados.length ? `
JÁ PRODUZIDOS (NÃO repita nenhum destes assuntos, histórias, ganchos nem variações próximas; escolha algo realmente diferente):
${usados.map(u => "- " + u).join("\n")}
` : "";
  const comentario = infantil ? "uma frase carinhosa para os pais (sem pedir comentários)" : "uma pergunta para gerar comentários";
  const hashtags = infantil ? "#shorts e #infantil" : "#shorts";
  let prompt = `Crie o roteiro narrado de um YouTube Short (vertical) de ${tipoCanal}, em português do Brasil.
Tema do canal: ${String(tema).slice(0, 100)}
Assunto específico: ${String(assunto).slice(0, 300) || pick("escolha um assunto pouco conhecido e intrigante dentro do tema", "escolha um assunto original, divertido e educativo dentro do tema", "escolha uma história original, inesperada e emocionante dentro do tema")}
Tom: ${String(tom).slice(0, 50)}
Duração: cerca de ${dur} segundos (~${palavras} palavras no total).
${bloqueio}
Regras de retenção (o algoritmo de Shorts testa o vídeo num grupo pequeno e mede quem NÃO desliza nos 2 primeiros segundos, quem assiste até o fim e quem reassiste; o roteiro precisa servir a isso):
- GANCHO: ${gancho}
- A imagem do 1º parágrafo deve ser ${img1} (precisa prender em 0,2 s).
- RITMO: frases curtas e diretas, zero enrolação. Cada parágrafo traz uma informação nova ou ${ritmo}. Nunca repita ideias, frases ou palavras de abertura dentro do mesmo roteiro.
- Divida em 6 a 9 parágrafos de 1 frase (no máximo 2 bem curtas). Cada parágrafo vai receber uma imagem.
- FINAL: ${final} Nunca prometa no gancho algo que o vídeo não entrega.
- CONSISTÊNCIA VISUAL: todos os prompts de imagem devem manter o mesmo estilo (paleta, iluminação, enquadramento), para o vídeo ter um padrão visual repetido.
- "titulo": curto (até 60 caracteres), que gere curiosidade sem mentir.
- "assunto": o assunto do roteiro resumido em até 12 palavras (usado para evitar repetições no futuro).${regrasExtra}
- Para cada parágrafo, inclua ${regraImagem}
- "descricao": descrição para o YouTube em português: 1ª linha com o gancho (aparece antes do "ver mais"), 2 a 3 frases sobre o vídeo sem entregar o final, ${comentario} e, no fim, 5 a 8 hashtags relevantes incluindo ${hashtags}.
Responda APENAS com JSON, sem markdown: {"titulo":"...","assunto":"...","descricao":"...","paragrafos":[{"texto":"...","imagem":"..."}]}`;
  if (modo === "descricao") prompt = `Escreva a descrição de um YouTube Short em português do Brasil, a partir do título e da narração abaixo.
Formato: 1ª linha com o gancho (aparece antes do "ver mais"), 2 a 3 frases sobre o vídeo sem entregar o final, ${infantil ? "uma frase carinhosa para os pais (sem pedir comentários)" : "uma pergunta para gerar comentários"} e, no fim, 5 a 8 hashtags relevantes incluindo #shorts${infantil ? " e #infantil" : ""}. Use só o que está na narração.
Título: ${String(titulo).slice(0, 150)}
Narração: ${String(texto).slice(0, 3000)}
Responda APENAS com JSON, sem markdown: {"descricao":"..."}`;

  const chamar = (modelo, thinking) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 3000, ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}) } })
  });
  const falhas = [], inicio = Date.now(), esperar = ms => new Promise(r => setTimeout(r, ms));
  for (const modelo of MODELOS) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      if (Date.now() - inicio > 45000) break;
      try {
        let r = await chamar(modelo, true);
        if (r.status === 400) r = await chamar(modelo, false);
        if (!r.ok) {
          console.error("Gemini", modelo, r.status, await r.text()); falhas.push(modelo + ": " + r.status);
          if (r.status === 429 || r.status === 403 || r.status === 401) return res.status(502).json({ erro: "Gemini recusou (" + r.status + "): limite grátis atingido ou chave inválida. Espere 1 minuto e tente de novo." });
          if (r.status === 503 && tentativa === 1) { await esperar(2000); continue; } // sobrecarga: tenta de novo
          break; // outro erro: próximo modelo
        }
        const d = await r.json();
        const txt = (d.candidates?.[0]?.content?.parts || []).map(c => c.text || "").join("");
        return res.status(200).json(JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)));
      } catch (e) {
        console.error("Gemini", modelo, e.name, e.message);
        falhas.push(modelo + ": " + (e.name === "TimeoutError" ? "sem resposta" : "resposta inválida"));
        break;
      }
    }
  }
  res.status(502).json({ erro: "O Gemini está sobrecarregado agora (" + falhas.join(" | ") + "). Tente de novo em 1 minuto." });
};
