# TarsoArt — instruções do projeto

Site em React + Vite (Cloudflare Pages) com backend em Cloudflare Worker.
Painel admin em `/house` edita textos, listas e mídias. Textos ficam no D1, mídias no R2.

## Regra de trabalho (definida pelo dono do projeto)

**Sempre commitar e fazer deploy de todas as alterações feitas nesta sessão**, sem precisar perguntar a cada vez.
Fluxo padrão ao terminar uma mudança:

1. Garantir que o build passa: `npm run build`.
2. Commitar tudo (mensagem clara, em português).
3. Deploy do **worker**: `npm run worker:deploy`.
4. Deploy do **frontend**: `git push origin main` (o Cloudflare Pages está conectado ao repo `RZB1414/tarso-art` e faz build/deploy automático no push para `main`). Se o auto-deploy não estiver ativo, usar `npx wrangler pages deploy dist --project-name tarso-art`.

> Mudanças que envolvem `worker/index.ts` **e** o frontend exigem os **dois** deploys: o worker valida/persiste os dados (ex.: normalização de conteúdo) e o frontend mostra a UI. Publicar só um lado quebra o recurso.

## Comandos úteis

- `npm run dev` — frontend em `http://127.0.0.1:5174` (porta fixa, `strictPort`).
- `npm run worker:dev` — worker local em `http://127.0.0.1:8790`.
- `npm run build` — typecheck (`tsc -b`, cobre `src` e `worker`) + build de produção em `dist`.
- `npm run d1:migrate:local` / `npm run d1:migrate:remote` — migrations do D1.
- `npm run worker:deploy` — roda `deploy:check` e depois `wrangler deploy --keep-vars`.

## Notas de ambiente

- O projeto está dentro do **OneDrive**, que às vezes trava arquivos em `.wrangler/tmp` e derruba o `worker:dev` com erro "Could not resolve .../middleware-loader.entry.ts". Correção: apagar `.wrangler/tmp` e rodar `npm run worker:dev` de novo.
- O D1 local persiste em `.wrangler/state`. Se trocar o `database_id` no `wrangler.toml`, o D1 local muda de arquivo (o conteúdo antigo fica órfão) — rode `npm run d1:migrate:local` no novo.

## Estrutura

- `src/components/Site.tsx` — site público; `src/components/AdminPanel.tsx` + `AdminControls.tsx` — painel admin.
- `src/components/ArtFrame.tsx` — quadro de mídia + texto sobreposto (posição/zoom/espessura/cor controlados por `ImageOverlayStyle`).
- `worker/index.ts` — API; normaliza/valida todo conteúdo salvo (`cleanOverlayStyle`, `cleanPlacement`, etc.).
- `src/types.ts` — tipos compartilhados entre frontend e worker.
- `migrations/` — schema do D1.
