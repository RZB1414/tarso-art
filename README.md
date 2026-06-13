# TarsoArt

Site em React + Vite para deploy no Cloudflare Pages, com backend em Cloudflare Worker.
O painel `/house` permite editar textos, listas e imagens do site. Os textos ficam no D1 e as imagens ficam no R2.

## Estrutura

- `src/`: frontend React/Vite.
- `src/components/Site.tsx`: site publico.
- `src/components/AdminPanel.tsx`: painel administrativo.
- `worker/index.ts`: API do Cloudflare Worker.
- `migrations/0001_init.sql`: tabelas D1.
- `migrations/0002_security.sql`: rate limit e auditoria.
- `migrations/0003_admin_security.sql`: estado de ativacao do 2FA.
- `wrangler.toml`: bindings do Worker.

## Desenvolvimento local

1. Instale dependencias:

```bash
npm install
```

2. Copie as variaveis locais:

```bash
cp .dev.vars.example .dev.vars
```

3. Gere o hash da senha do admin:

```bash
npm run hash:password
```

Cole o resultado em `ADMIN_PASSWORD_HASH` dentro de `.dev.vars`.
Defina tambem um `SESSION_SECRET` longo e aleatorio.

4. Gere a chave do Google Authenticator:

```bash
npm run totp:setup
```

Cole o valor `ADMIN_TOTP_SECRET` em `.dev.vars`. Depois abra `/house`, entre com a senha e use a tela "Configurar 2FA" para escanear o QR local ou copiar a chave manual no Google Authenticator. Essa chave e sensivel; nao envie para Git.

5. Aplique a migration D1 local:

```bash
npm run d1:migrate:local
```

6. Rode o Worker local na porta `8790`:

```bash
npm run worker:dev
```

7. Em outro terminal, rode o frontend:

```bash
npm run dev
```

O frontend sempre fica na porta `5174`. O proxy do Vite aponta para o Worker em `8790` por padrao.
Se voce realmente precisar mudar a porta do Worker, aponte o Vite para ela:

```bash
$env:VITE_API_PROXY_TARGET="http://127.0.0.1:8791"
npm run dev
```

Abra `http://127.0.0.1:5174` para o site e `http://127.0.0.1:5174/house` para o painel.
O frontend esta configurado com `strictPort`, entao ele sempre usa a porta `5174` e falha se ela estiver ocupada.

## Deploy no Cloudflare

1. Crie o D1:

```bash
npx wrangler d1 create tarsoart-db
```

Copie o `database_id` retornado para `wrangler.toml`.

2. Crie o bucket R2:

```bash
npx wrangler r2 bucket create tarsoart-assets
```

3. Configure secrets do Worker:

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put ADMIN_TOTP_SECRET
npx wrangler secret put SESSION_SECRET
```

4. Aplique migrations no D1 remoto:

```bash
npm run d1:migrate:remote
```

5. Deploy do Worker:

```bash
npm run worker:deploy
```

Esse comando roda `npm run deploy:check` antes do deploy. Ele falha se o `database_id` ainda estiver como placeholder ou se `ADMIN_ORIGIN` ainda estiver apontando para localhost.

6. Deploy do frontend no Cloudflare Pages:

- Build command: `npm run build`
- Build output: `dist`
- O projeto inclui um proxy em `functions/api/[[path]].js` para enviar `/api/*` ao Worker.

Em producao, o navegador deve chamar a API pelo mesmo dominio do Pages (`/api/*`). Isso evita bloqueio de cookies de terceiros no fluxo de admin/2FA. O Worker continua sendo o backend real; o Pages apenas faz o proxy para ele.

`VITE_API_BASE_URL` deve ficar vazio para novos builds de producao. Se a variavel ainda existir no painel do Cloudflare Pages, o frontend ignora esse valor quando roda fora de localhost e usa `/api/*`.

## Rotas da API

- `GET /api/site`: conteudo publico do site.
- `POST /api/admin/login`: login do admin.
- `GET /api/admin/2fa/setup`: retorna QR/chave de setup apos a senha, apenas antes da primeira ativacao.
- `POST /api/admin/2fa/setup/verify`: valida o primeiro codigo 2FA e marca o setup como ativado.
- `POST /api/admin/2fa/verify`: valida Google Authenticator apos senha.
- `POST /api/admin/2fa/refresh`: exige novo codigo 2FA quando a janela de 24h expira.
- `POST /api/admin/logout`: encerra sessao.
- `GET /api/admin/me`: valida sessao.
- `PUT /api/admin/site`: salva conteudo.
- `POST /api/admin/images`: envia imagem para R2.
- `GET /api/assets/:key`: serve imagem do R2.

## Seguranca admin

- `/house` e apenas a rota visual do painel. O frontend do Cloudflare Pages e publico por natureza, entao a seguranca real fica no Worker.
- O link de `/house` nao aparece no site publico; acesse o painel digitando a rota diretamente.
- Nenhuma API admin aceita leitura/escrita sem sessao assinada, 2FA valido e, para mutacoes, `X-CSRF-Token`.
- A senha gera apenas um cookie curto de desafio. O painel so abre apos o codigo TOTP do Google Authenticator.
- A tela de setup do 2FA so aparece apos a senha e deixa de revelar a chave depois que o primeiro codigo e validado.
- Um novo codigo 2FA e exigido a cada 24 horas.
- Login e 2FA tem rate limit por IP com bloqueio temporario.
- Upload aceita apenas PNG, JPEG, WebP e GIF, com validacao de assinatura do arquivo. SVG fica bloqueado.
- O conteudo salvo pelo admin e normalizado no Worker: URLs perigosas sao descartadas, textos/listas tem limite e imagens salvas so aceitam assets do Worker ou HTTPS.
- Eventos de autenticacao, rejeicoes de CSRF e uploads sao registrados em `auth_events`.
- Headers de seguranca ficam em `public/_headers` e no Worker.

Para rodar os smoke tests de seguranca localmente:

```bash
$env:ADMIN_TEST_PASSWORD="sua_senha_admin"
npm run security:smoke
```

Para incluir probes adicionais:

```bash
$env:ADMIN_TEST_PASSWORD="sua_senha_admin"
$env:SECURITY_TEST_API_BASE_URL="http://127.0.0.1:8790"
npm run security:pentest
```

Se precisar trocar o aparelho do Google Authenticator, gere um novo `ADMIN_TOTP_SECRET`, atualize o secret do Worker e remova a flag `totp_configured_at` da tabela `admin_security` para liberar a tela de setup novamente.
