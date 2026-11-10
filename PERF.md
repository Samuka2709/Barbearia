# Desempenho

Medido com Lighthouse 12, perfil mobile (4G simulado), servidor local. Mesma página, mesmas condições.

| Mudança | Antes → Depois | Resultado |
|---|---|---|
| Tesoura PNG 684 KB → WebP 8–22 KB com srcset e preload | LCP 8,9 s → 2,8–3,5 s | mantida |
| Fotos JPG (2 MB) → WebP (780 KB) com width/height | peso 1.736 KB → 461 KB | mantida |
| Granulado SVG com blend → bitmap 8 KB sem blend; sem blur no feixe; blur do menu só no desktop | renderização mais leve (não medível no Lighthouse) | mantida |
| Fontes do Google → próprias (latin, variáveis) + preload | FCP 2,6–3,0 s → 1,4 s; nota 86–92 → 97 | mantida |
| Fotos com versão de 400 px (srcset) para telas pequenas | peso 474 KB → 338 KB; nota 97 → 97 | mantida |
| Mapa só carrega ao clicar; faixas pausam fora da tela; rolagem sem leituras repetidas | menos trabalho em segundo plano | mantida |

Resultado final: nota 97, LCP 2,5 s, FCP 1,4 s, TBT 0 ms, CLS 0,004, peso 338 KB.

Cabeçalhos de cache prontos em `_headers` (Netlify/Cloudflare Pages) e `vercel.json` (Vercel): imagens e fontes ficam 1 ano em cache.

Não aplicado: `content-visibility` nas seções (TBT já é 0 ms, ganho não mensurável e risco com a seção fixa do antes e depois) e sépia gravado nas fotos (o efeito de passar o mouse na faixa de fotos depende do filtro).
