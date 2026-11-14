// Função do Vercel: busca um clipe grátis (Pixabay e/ou Pexels) e devolve o MP4.
// Variáveis de ambiente no Vercel: PIXABAY_API_KEY (grátis em pixabay.com/api/docs) e/ou PEXELS_API_KEY, e APP_SENHA
// A Vercel limita a resposta de uma função a ~4,5 MB, então só devolvemos clipes pequenos.
const MAX_BYTES = 4200000;

// Cada fonte devolve uma lista de clipes: { id, arquivos: [{ link, w, h, tam }] } (do melhor para o pior arquivo)
const FONTES = {
  async pixabay(q) {
    const r = await fetch("https://pixabay.com/api/videos/?safesearch=true&per_page=20&key=" + encodeURIComponent(process.env.PIXABAY_API_KEY) + "&q=" + encodeURIComponent(q), { signal: AbortSignal.timeout(15000) });
    if (!r.ok) { const e = new Error("Pixabay respondeu " + r.status); e.status = r.status; throw e; }
    const hits = ((await r.json()).hits || []).filter(v => v.duration >= 3 && v.duration <= 25);
    const vert = v => (v.videos?.medium?.height || 0) > (v.videos?.medium?.width || 0) ? 0 : 1; // verticais primeiro
    return hits.sort((a, b) => vert(a) - vert(b)).map(v => ({
      id: "px" + v.id,
      arquivos: ["large", "medium", "small", "tiny"].map(k => v.videos?.[k]).filter(f => f && f.url).map(f => ({ link: f.url, w: f.width, h: f.height, tam: f.size || 0 }))
    }));
  },
  async pexels(q) {
    const r = await fetch("https://api.pexels.com/videos/search?orientation=portrait&size=medium&per_page=20&query=" + encodeURIComponent(q), {
      headers: { Authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { const e = new Error("Pexels respondeu " + r.status); e.status = r.status; throw e; }
    return ((await r.json()).videos || []).filter(v => v.duration >= 3 && v.duration <= 25).map(v => ({
      id: "pe" + v.id,
      arquivos: (v.video_files || []).filter(f => f.file_type === "video/mp4" && f.link && f.height >= f.width && f.width >= 360 && f.width <= 1080)
        .sort((a, b) => b.width - a.width).map(f => ({ link: f.link, w: f.width, h: f.height, tam: 0 }))
    }));
  }
};

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "use POST" });
  const ativas = [process.env.PIXABAY_API_KEY && "pixabay", process.env.PEXELS_API_KEY && "pexels"].filter(Boolean);
  if (!ativas.length) return res.status(500).json({ erro: "PIXABAY_API_KEY não configurada no Vercel (chave grátis em pixabay.com/api/docs)" });
  if (process.env.APP_SENHA && req.headers["x-senha"] !== process.env.APP_SENHA) return res.status(401).json({ erro: "senha incorreta" });

  const busca = String((req.body || {}).busca || "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const pular = new Set((Array.isArray((req.body || {}).pular) ? req.body.pular : []).map(String));
  if (!busca) return res.status(400).json({ erro: "busca vazia" });

  const inicio = Date.now(), erros = [];
  const consultas = [busca, busca.split(/\s+/).slice(0, 2).join(" ")].filter((q, i, a) => q && a.indexOf(q) === i);
  for (const q of consultas) {
    for (const fonte of ativas) {
      let clipes;
      try { clipes = await FONTES[fonte](q); }
      catch (e) { console.error(fonte, e.message); erros.push(fonte + ": " + (e.status || "erro")); continue; }
      for (const c of clipes.filter(c => !pular.has(c.id)).slice(0, 8)) {
        for (const f of c.arquivos.slice(0, 4)) {
          if (Date.now() - inicio > 45000) break;
          if (f.tam > MAX_BYTES) continue; // o Pixabay informa o tamanho, então nem baixa os grandes
          try {
            const r = await fetch(f.link, { signal: AbortSignal.timeout(20000) });
            if (!r.ok) continue;
            const tam = Number(r.headers.get("content-length")) || 0;
            if (tam > MAX_BYTES) { try { await r.body.cancel(); } catch {} continue; }
            const buf = Buffer.from(await r.arrayBuffer());
            if (buf.length > MAX_BYTES) continue;
            res.setHeader("Content-Type", "video/mp4");
            res.setHeader("x-video-id", c.id);
            res.setHeader("x-fonte", fonte);
            res.setHeader("Access-Control-Expose-Headers", "x-video-id");
            return res.status(200).send(buf);
          } catch (e) { console.error("download", e.message); }
        }
      }
    }
  }
  if (erros.length && erros.length >= consultas.length * ativas.length) return res.status(502).json({ erro: "a busca de vídeos falhou (" + erros.join(" | ") + "). Confira a chave no Vercel ou espere um minuto." });
  res.status(404).json({ erro: `não achei um clipe pequeno para "${busca}". Troque a busca (em inglês funciona melhor) ou envie o vídeo manualmente.` });
};
