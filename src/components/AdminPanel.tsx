import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  get2faSetup,
  getAdminSession,
  login,
  logout,
  refresh2fa,
  saveSiteContent,
  verify2fa,
  verify2faSetup,
} from "../lib/api";
import type { TotpSetup } from "../lib/api";
import { AdminSection, CardEditor, ImageField, TextArea, TextField } from "./AdminControls";
import type { FeaturedItem, PortfolioItem, ProcessStep, SiteContent } from "../types";

type AdminPanelProps = {
  initialContent: SiteContent;
  loading: boolean;
  onContentSaved: (content: SiteContent) => void;
};

type Path = Array<string | number>;
type AdminTab = "brand" | "hero" | "portfolio" | "featured" | "about" | "process" | "commission";
type AuthState = "checking" | "guest" | "totp" | "totpSetup" | "totpRefresh" | "authed";

const tabs: Array<{ id: AdminTab; label: string; description: string }> = [
  { id: "brand", label: "Marca e redes", description: "Nome, links sociais, email e rodape." },
  { id: "hero", label: "Inicio", description: "Primeira dobra do site: titulo, subtitulo, tags e imagem principal." },
  { id: "portfolio", label: "Portfolio", description: "Lista de trabalhos visiveis na grade principal." },
  { id: "featured", label: "Destaques", description: "Projetos em destaque com imagem grande e detalhes extras." },
  { id: "about", label: "Sobre", description: "Texto de apresentacao e foto/retrato." },
  { id: "process", label: "Processo", description: "Etapas que explicam como o trabalho e criado." },
  { id: "commission", label: "Contato", description: "Chamada para comissoes, email e mensagem do formulario." },
];

function setAtPath<T>(source: T, path: Path, value: unknown): T {
  const root = structuredClone(source) as any;
  let cursor = root;
  path.slice(0, -1).forEach((key) => {
    cursor = cursor[key];
  });
  cursor[path[path.length - 1]] = value;
  return root;
}

function textLines(value: string, maxItems: number) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function LoginScreen({ onPasswordAccepted }: { onPasswordAccepted: (totpConfigured: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await login(password);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onPasswordAccepted(Boolean(result.data?.totpConfigured));
  }

  return (
    <main className="admin-login">
      <form className="admin-login__box" onSubmit={submit}>
        <a className="admin-back" href="/">
          ← Voltar ao site
        </a>
        <p className="mono">Tarso Art</p>
        <h1>Painel Admin</h1>
        <p className="admin-login__hint">
          Acesso protegido por senha, rate limit e Google Authenticator.
        </p>
        <TextField
          label="Senha"
          value={password}
          onChange={setPassword}
          placeholder="Digite a senha do admin"
          type="password"
          autoComplete="current-password"
        />
        {error ? <p className="admin-error">{error}</p> : null}
        <button className="admin-btn admin-btn--primary" disabled={busy} type="submit">
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}

function TwoFactorScreen({
  mode,
  canSetup,
  onVerified,
  onBack,
  onSetup,
}: {
  mode: "challenge" | "refresh";
  canSetup?: boolean;
  onVerified: () => void;
  onBack: () => void;
  onSetup?: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = mode === "challenge" ? await verify2fa(code) : await refresh2fa(code);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onVerified();
  }

  return (
    <main className="admin-login">
      <form className="admin-login__box" onSubmit={submit}>
        <button className="admin-back admin-back--button" type="button" onClick={onBack}>
          ← Voltar
        </button>
        <p className="mono">Google Authenticator</p>
        <h1>Codigo 2FA</h1>
        <p className="admin-login__hint">
          Digite o codigo de 6 digitos. Um novo codigo sera exigido a cada 24 horas.
        </p>
        <TextField
          label="Codigo"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        {error ? <p className="admin-error">{error}</p> : null}
        <button className="admin-btn admin-btn--primary" disabled={busy || code.length !== 6} type="submit">
          {busy ? "Verificando..." : "Verificar 2FA"}
        </button>
        {mode === "challenge" && canSetup ? (
          <button className="admin-btn admin-btn--ghost" type="button" onClick={onSetup}>
            Configurar Google Authenticator
          </button>
        ) : null}
      </form>
    </main>
  );
}

function TwoFactorSetupScreen({
  onVerified,
  onBack,
}: {
  onVerified: () => void;
  onBack: () => void;
}) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    get2faSetup()
      .then(async (result) => {
        if (cancelled) return;
        if (result.error || !result.data) {
          setError(result.error || "Nao foi possivel carregar a configuracao 2FA.");
          return;
        }

        setSetup(result.data);
        const image = await QRCode.toDataURL(result.data.otpauthUrl, {
          width: 232,
          margin: 1,
          errorCorrectionLevel: "M",
          color: {
            dark: "#111318",
            light: "#e3e1da",
          },
        });
        if (!cancelled) setQrUrl(image);
      })
      .catch(() => {
        if (!cancelled) setError("Nao foi possivel gerar o QR do 2FA.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("Copie manualmente");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await verify2faSetup(code);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onVerified();
  }

  return (
    <main className="admin-login">
      <form className="admin-login__box admin-login__box--wide" onSubmit={submit}>
        <button className="admin-back admin-back--button" type="button" onClick={onBack}>
          &lt;- Voltar
        </button>
        <p className="mono">Google Authenticator</p>
        <h1>Configurar 2FA</h1>
        <p className="admin-login__hint">
          Escaneie o QR ou use a chave manual no Google Authenticator. A chave so aparece antes da primeira ativacao.
        </p>

        {loading ? <p className="admin-loading-inline">Gerando configuracao segura...</p> : null}

        {!loading && setup ? (
          <div className="admin-setup">
            <div className="admin-setup__qr">
              {qrUrl ? <img src={qrUrl} alt="QR code para configurar Google Authenticator" /> : null}
            </div>

            <ol className="admin-setup__steps">
              <li>Abra o Google Authenticator.</li>
              <li>Toque em adicionar conta.</li>
              <li>Escaneie o QR ou escolha inserir chave de configuracao.</li>
              <li>Digite abaixo o codigo de 6 digitos gerado no app.</li>
            </ol>

            <div className="admin-setup__key">
              <span>Chave manual</span>
              <code>{setup.secret}</code>
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => copy(setup.secret, "Chave copiada")}>
                Copiar chave
              </button>
            </div>

            <details className="admin-setup__details">
              <summary>URL otpauth</summary>
              <textarea readOnly value={setup.otpauthUrl} />
              <button className="admin-btn admin-btn--ghost" type="button" onClick={() => copy(setup.otpauthUrl, "URL copiada")}>
                Copiar URL
              </button>
            </details>

            {copied ? <p className="admin-success">{copied}</p> : null}
          </div>
        ) : null}

        {error ? <p className="admin-error">{error}</p> : null}
        <TextField
          label="Codigo gerado no app"
          value={code}
          onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
        />
        <button className="admin-btn admin-btn--primary" disabled={busy || code.length !== 6 || !setup} type="submit">
          {busy ? "Ativando..." : "Validar e ativar 2FA"}
        </button>
      </form>
    </main>
  );
}

function makePortfolioItem(index: number): PortfolioItem {
  return {
    id: `new-work-${Date.now()}-${index}`,
    title: "Novo trabalho",
    category: "Original Characters",
    description: "Descricao do trabalho",
    variant: "ink",
    span: "s-b",
  };
}

function makeFeaturedItem(index: number): FeaturedItem {
  return {
    id: `featured-${Date.now()}-${index}`,
    number: String(index + 1).padStart(2, "0"),
    category: "Featured",
    title: "Novo destaque",
    description: "Descricao do destaque",
    variant: "ink",
    meta: [
      { label: "Medium", value: "Ink" },
      { label: "Year", value: "2026" },
    ],
  };
}

function makeProcessStep(index: number): ProcessStep {
  return {
    id: `step-${Date.now()}-${index}`,
    number: String(index + 1).padStart(2, "0"),
    title: "Nova etapa",
    text: "Descricao da etapa",
    progress: "25%",
    variant: "graphite",
  };
}

export function AdminPanel({ initialContent, loading, onContentSaved }: AdminPanelProps) {
  const [auth, setAuth] = useState<AuthState>("checking");
  const [canSetup2fa, setCanSetup2fa] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("brand");
  const [draft, setDraft] = useState(initialContent);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initialContent), [draft, initialContent]);

  useEffect(() => {
    if (!loading) setDraft(initialContent);
  }, [initialContent, loading]);

  useEffect(() => {
    getAdminSession().then((result) => {
      if (!result.error) {
        setCanSetup2fa(false);
        setAuth("authed");
        return;
      }
      setAuth(result.code === "TOTP_REQUIRED" ? "totpRefresh" : "guest");
    });
  }, []);

  function update(path: Path, value: unknown) {
    setDraft((current) => setAtPath(current, path, value));
    setMessage("");
  }

  async function save() {
    if (!dirty) {
      setMessage("Nada para salvar. O site ja esta atualizado.");
      return;
    }
    setSaving(true);
    setMessage("");
    const result = await saveSiteContent(draft);
    setSaving(false);
    if (result.error || !result.data) {
      setMessage(result.error || "Erro ao salvar");
      return;
    }
    setDraft(result.data);
    onContentSaved(result.data);
    setMessage("Conteudo salvo com sucesso.");
  }

  async function handleLogout() {
    await logout();
    setCanSetup2fa(false);
    setAuth("guest");
  }

  if (auth === "checking" || loading) {
    return <main className="admin-loading">Carregando painel...</main>;
  }

  if (auth === "guest") {
    return (
      <LoginScreen
        onPasswordAccepted={(totpConfigured) => {
          setCanSetup2fa(!totpConfigured);
          setAuth(totpConfigured ? "totp" : "totpSetup");
        }}
      />
    );
  }

  if (auth === "totp") {
    return (
      <TwoFactorScreen
        mode="challenge"
        canSetup={canSetup2fa}
        onSetup={() => setAuth("totpSetup")}
        onVerified={() => setAuth("authed")}
        onBack={() => setAuth("guest")}
      />
    );
  }

  if (auth === "totpSetup") {
    return (
      <TwoFactorSetupScreen
        onVerified={() => {
          setCanSetup2fa(false);
          setAuth("authed");
        }}
        onBack={() => setAuth("totp")}
      />
    );
  }

  if (auth === "totpRefresh") {
    return <TwoFactorScreen mode="refresh" onVerified={() => setAuth("authed")} onBack={() => setAuth("guest")} />;
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-logo" href="/">
          TARSO<span>/ART</span>
        </a>
        <nav>
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              key={tab.id}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__status">
          <strong>{dirty ? "Alteracoes pendentes" : "Tudo salvo"}</strong>
          <span>{dirty ? "Clique em salvar antes de sair." : "Nenhuma edicao nova."}</span>
        </div>
        <button className="admin-btn admin-btn--ghost" type="button" onClick={handleLogout}>
          Sair
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="mono">Painel de edicao</p>
            <h1>Editar site</h1>
            <p className="admin-topbar__hint">{activeTabInfo.description}</p>
          </div>
          <div className="admin-actions">
            <a className="admin-btn admin-btn--ghost" href="/" target="_blank" rel="noopener">
              Ver site
            </a>
            <button className="admin-btn admin-btn--primary" type="button" disabled={saving || !dirty} onClick={save}>
              {saving ? "Salvando..." : dirty ? "Salvar alteracoes" : "Tudo salvo"}
            </button>
          </div>
        </header>

        {message ? <p className={message.toLowerCase().includes("erro") ? "admin-error" : "admin-success"}>{message}</p> : null}

        {activeTab === "brand" ? (
          <AdminSection title="Marca e redes sociais" description="Edite apenas o que aparece para visitantes: nome, redes sociais, email e rodape.">
            <div className="admin-grid">
              <TextField label="Nome no topo" value={draft.branding.name} maxLength={40} help="Aparece no menu e no rodape." onChange={(value) => update(["branding", "name"], value)} />
              <TextField label="Texto ao lado do nome" value={draft.branding.tag} maxLength={40} help="Texto curto ao lado da marca." onChange={(value) => update(["branding", "tag"], value)} />
              <TextField label="Instagram" value={draft.branding.instagramHandle} maxLength={60} help="Exemplo: @tarso.art" onChange={(value) => update(["branding", "instagramHandle"], value)} />
              <TextField label="Link do Instagram" value={draft.branding.instagramUrl} type="url" inputMode="url" help="Cole o link completo do perfil." onChange={(value) => update(["branding", "instagramUrl"], value)} />
              <TextField label="TikTok" value={draft.branding.tiktokHandle} maxLength={60} help="Exemplo: @tarso.art" onChange={(value) => update(["branding", "tiktokHandle"], value)} />
              <TextField label="Link do TikTok" value={draft.branding.tiktokUrl} type="url" inputMode="url" help="Link completo do perfil no TikTok." onChange={(value) => update(["branding", "tiktokUrl"], value)} />
              <TextField label="Email visivel" value={draft.branding.email} type="email" inputMode="email" help="Email usado no botao de contato." onChange={(value) => update(["branding", "email"], value)} />
              <TextField label="Texto do rodape" value={draft.footer.copyright} maxLength={160} help="Texto pequeno no final da pagina." onChange={(value) => update(["footer", "copyright"], value)} />
            </div>
          </AdminSection>
        ) : null}

        {activeTab === "hero" ? (
          <AdminSection title="Inicio do site" description="Esta e a primeira parte que o visitante ve. Mantenha o texto direto e escolha uma imagem forte.">
            <div className="admin-grid">
              <TextField label="Texto pequeno 1" value={draft.hero.kicker[0] || ""} maxLength={48} help="Linha pequena acima do titulo." onChange={(value) => update(["hero", "kicker", 0], value)} />
              <TextField label="Texto pequeno 2" value={draft.hero.kicker[1] || ""} maxLength={48} help="Segunda linha pequena." onChange={(value) => update(["hero", "kicker", 1], value)} />
              <TextField label="Texto pequeno 3" value={draft.hero.kicker[2] || ""} maxLength={48} help="Pode ser o @ do artista." onChange={(value) => update(["hero", "kicker", 2], value)} />
              <TextArea label="Titulo principal" value={draft.hero.titleLines.join("\n")} rows={5} maxLength={180} help="Uma linha no campo vira uma linha grande no site." onChange={(value) => update(["hero", "titleLines"], textLines(value, 6))} />
              <TextArea label="Subtitulo" value={draft.hero.subtitle} maxLength={240} help="Frase curta abaixo do titulo." onChange={(value) => update(["hero", "subtitle"], value)} />
              <TextArea label="Tags visiveis" value={draft.hero.tags.join("\n")} rows={5} maxLength={360} help="Uma tag por linha." onChange={(value) => update(["hero", "tags"], textLines(value, 12))} />
            </div>
            <ImageField
              label="Imagem principal do hero"
              help="Esta imagem ocupa o bloco principal do topo. Arraste para enquadrar rosto, corpo ou detalhe importante."
              value={draft.hero.mainImageUrl}
              alt={draft.hero.mainImageAlt}
              placement={draft.hero.mainImagePlacement}
              overlay={draft.hero.mainImageOverlay}
              preview={{
                className: "admin-image-preview--hero",
                category: "Hero",
                description: "Main artwork",
                label: "MAIN",
              }}
              onImageChange={(url, alt) => {
                update(["hero", "mainImageUrl"], url);
                update(["hero", "mainImageAlt"], alt);
              }}
              onPlacementChange={(placement) => update(["hero", "mainImagePlacement"], placement)}
              onOverlayChange={(overlay) => update(["hero", "mainImageOverlay"], overlay)}
            />
          </AdminSection>
        ) : null}

        {activeTab === "portfolio" ? (
          <AdminSection
            title="Portfolio"
            description="Cada trabalho vira um card na grade do portfolio. Titulo, categoria, descricao e imagem sao visiveis no site."
            action={
              <button
                className="admin-btn admin-btn--primary"
                type="button"
                onClick={() => update(["portfolio", "items"], [...draft.portfolio.items, makePortfolioItem(draft.portfolio.items.length)])}
              >
                Adicionar trabalho
              </button>
            }
          >
            <div className="admin-grid">
              <TextField label="Texto pequeno da secao" value={draft.portfolio.eyebrow} maxLength={80} help="Aparece acima do titulo da secao." onChange={(value) => update(["portfolio", "eyebrow"], value)} />
              <TextArea label="Titulo" value={draft.portfolio.title} maxLength={120} help="Use quebra de linha se quiser dividir o titulo." onChange={(value) => update(["portfolio", "title"], value)} />
            </div>
            {draft.portfolio.items.map((item, index) => (
              <CardEditor
                title={item.title || `Trabalho ${index + 1}`}
                description={`Card ${index + 1} do portfolio`}
                key={`portfolio-${index}`}
                onRemove={() => update(["portfolio", "items"], draft.portfolio.items.filter((_, i) => i !== index))}
              >
                <TextField label="Titulo" value={item.title} maxLength={100} help="Nome do trabalho." onChange={(value) => update(["portfolio", "items", index, "title"], value)} />
                <TextField label="Categoria" value={item.category} maxLength={80} help="Exemplo: Fan Art, Sketches, Comic Panels." onChange={(value) => update(["portfolio", "items", index, "category"], value)} />
                <TextArea label="Descricao" value={item.description} maxLength={400} help="Texto curto que aparece no card e no detalhe." onChange={(value) => update(["portfolio", "items", index, "description"], value)} />
                <ImageField
                  label="Imagem"
                  help="A previa usa o mesmo formato desse card no site."
                  value={item.imageUrl}
                  alt={item.imageAlt}
                  placement={item.imagePlacement}
                  overlay={item.imageOverlay}
                  preview={{
                    className: `admin-image-preview--portfolio admin-image-preview--${item.span}`,
                    category: item.category,
                    description: item.description,
                    label: `#${String(index + 1).padStart(2, "0")}`,
                    zoom: true,
                  }}
                  onImageChange={(url, alt) => {
                    update(["portfolio", "items", index, "imageUrl"], url);
                    update(["portfolio", "items", index, "imageAlt"], alt);
                  }}
                  onPlacementChange={(placement) => update(["portfolio", "items", index, "imagePlacement"], placement)}
                  onOverlayChange={(overlay) => update(["portfolio", "items", index, "imageOverlay"], overlay)}
                />
              </CardEditor>
            ))}
          </AdminSection>
        ) : null}

        {activeTab === "featured" ? (
          <AdminSection
            title="Destaques"
            description="Use esta area para trabalhos principais, com imagem maior e detalhes extras."
            action={
              <button
                className="admin-btn admin-btn--primary"
                type="button"
                onClick={() => update(["featured", "items"], [...draft.featured.items, makeFeaturedItem(draft.featured.items.length)])}
              >
                Adicionar destaque
              </button>
            }
          >
            <div className="admin-grid">
              <TextField label="Texto pequeno da secao" value={draft.featured.eyebrow} maxLength={80} help="Aparece acima do titulo." onChange={(value) => update(["featured", "eyebrow"], value)} />
              <TextArea label="Titulo" value={draft.featured.title} maxLength={120} help="Titulo da secao de destaques." onChange={(value) => update(["featured", "title"], value)} />
            </div>
            {draft.featured.items.map((item, index) => (
              <CardEditor
                title={item.title || `Destaque ${index + 1}`}
                description={`Destaque ${index + 1}`}
                key={`featured-${index}`}
                onRemove={() => update(["featured", "items"], draft.featured.items.filter((_, i) => i !== index))}
              >
                <TextField label="Numero" value={item.number} maxLength={8} help="Exemplo: 01, 02, 03." onChange={(value) => update(["featured", "items", index, "number"], value)} />
                <TextField label="Categoria" value={item.category} maxLength={80} help="Tipo do trabalho." onChange={(value) => update(["featured", "items", index, "category"], value)} />
                <TextField label="Titulo" value={item.title} maxLength={120} help="Nome do destaque." onChange={(value) => update(["featured", "items", index, "title"], value)} />
                <TextArea label="Descricao" value={item.description} maxLength={600} help="Texto principal desse destaque." onChange={(value) => update(["featured", "items", index, "description"], value)} />
                <TextArea
                  label="Detalhes extras"
                  value={item.meta.map((meta) => `${meta.label}: ${meta.value}`).join("\n")}
                  rows={4}
                  maxLength={500}
                  help="Uma linha por detalhe. Exemplo: Ano: 2026"
                  onChange={(value) =>
                    update(
                      ["featured", "items", index, "meta"],
                      value
                        .split("\n")
                        .map((row) => {
                          const [label, ...rest] = row.split(":");
                          return { label: label?.trim() || "Info", value: rest.join(":").trim() };
                        })
                        .filter((meta) => meta.value),
                    )
                  }
                />
                <ImageField
                  label="Imagem"
                  help="A previa mostra o destaque como ele aparece na pagina."
                  value={item.imageUrl}
                  alt={item.imageAlt}
                  placement={item.imagePlacement}
                  overlay={item.imageOverlay}
                  preview={{
                    className: "admin-image-preview--featured",
                    category: item.category,
                    description: item.description,
                    label: `FEAT ${item.number}`,
                    zoom: true,
                  }}
                  onImageChange={(url, alt) => {
                    update(["featured", "items", index, "imageUrl"], url);
                    update(["featured", "items", index, "imageAlt"], alt);
                  }}
                  onPlacementChange={(placement) => update(["featured", "items", index, "imagePlacement"], placement)}
                  onOverlayChange={(overlay) => update(["featured", "items", index, "imageOverlay"], overlay)}
                />
              </CardEditor>
            ))}
          </AdminSection>
        ) : null}

        {activeTab === "about" ? (
          <AdminSection title="Sobre" description="Texto de apresentacao do artista e foto/retrato.">
            <div className="admin-grid">
              <TextField label="Texto pequeno da secao" value={draft.about.eyebrow} maxLength={80} help="Aparece acima do bloco sobre." onChange={(value) => update(["about", "eyebrow"], value)} />
              <TextField label="Frase" value={draft.about.quote} maxLength={160} help="Primeira parte da frase grande." onChange={(value) => update(["about", "quote"], value)} />
              <TextField label="Frase destacada" value={draft.about.quoteMuted} maxLength={160} help="Parte destacada da frase." onChange={(value) => update(["about", "quoteMuted"], value)} />
              <TextArea label="Texto" value={draft.about.body} rows={6} maxLength={1200} help="Texto completo sobre o artista." onChange={(value) => update(["about", "body"], value)} />
              <TextField label="Assinatura" value={draft.about.signature} maxLength={80} help="Nome ou assinatura que fecha a secao." onChange={(value) => update(["about", "signature"], value)} />
            </div>
            <ImageField
              label="Foto / retrato"
              help="Use os controles para centralizar rosto, pose ou detalhe."
              value={draft.about.imageUrl}
              alt={draft.about.imageAlt}
              placement={draft.about.imagePlacement}
              overlay={draft.about.imageOverlay}
              preview={{
                className: "admin-image-preview--portrait",
                variant: "graphite",
                description: "Self portrait or photo",
                label: "PHOTO",
                round: true,
              }}
              onImageChange={(url, alt) => {
                update(["about", "imageUrl"], url);
                update(["about", "imageAlt"], alt);
              }}
              onPlacementChange={(placement) => update(["about", "imagePlacement"], placement)}
              onOverlayChange={(overlay) => update(["about", "imageOverlay"], overlay)}
            />
          </AdminSection>
        ) : null}

        {activeTab === "process" ? (
          <AdminSection
            title="Processo"
            description="Explique as etapas de criacao. Cada etapa aparece como um card."
            action={
              <button
                className="admin-btn admin-btn--primary"
                type="button"
                onClick={() => update(["process", "steps"], [...draft.process.steps, makeProcessStep(draft.process.steps.length)])}
              >
                Adicionar etapa
              </button>
            }
          >
            <div className="admin-grid">
              <TextField label="Texto pequeno da secao" value={draft.process.eyebrow} maxLength={80} help="Aparece acima do titulo." onChange={(value) => update(["process", "eyebrow"], value)} />
              <TextArea label="Titulo" value={draft.process.title} maxLength={120} help="Titulo da secao de processo." onChange={(value) => update(["process", "title"], value)} />
            </div>
            {draft.process.steps.map((step, index) => (
              <CardEditor
                title={step.title || `Etapa ${index + 1}`}
                description={`Etapa ${index + 1} do processo`}
                key={`process-${index}`}
                onRemove={() => update(["process", "steps"], draft.process.steps.filter((_, i) => i !== index))}
              >
                <TextField label="Numero" value={step.number} maxLength={8} help="Exemplo: 01." onChange={(value) => update(["process", "steps", index, "number"], value)} />
                <TextField label="Titulo" value={step.title} maxLength={120} help="Nome da etapa." onChange={(value) => update(["process", "steps", index, "title"], value)} />
                <TextArea label="Texto" value={step.text} maxLength={600} help="Explique essa etapa em poucas frases." onChange={(value) => update(["process", "steps", index, "text"], value)} />
                <ImageField
                  label="Imagem"
                  help="Opcional. A previa segue o formato do card no site."
                  value={step.imageUrl}
                  alt={step.imageAlt}
                  placement={step.imagePlacement}
                  overlay={step.imageOverlay}
                  preview={{
                    className: "admin-image-preview--process",
                    variant: step.variant,
                    description: step.text,
                  }}
                  onImageChange={(url, alt) => {
                    update(["process", "steps", index, "imageUrl"], url);
                    update(["process", "steps", index, "imageAlt"], alt);
                  }}
                  onPlacementChange={(placement) => update(["process", "steps", index, "imagePlacement"], placement)}
                  onOverlayChange={(overlay) => update(["process", "steps", index, "imageOverlay"], overlay)}
                />
              </CardEditor>
            ))}
          </AdminSection>
        ) : null}

        {activeTab === "commission" ? (
          <AdminSection title="Contato" description="Textos da area de comissoes e contato.">
            <div className="admin-grid">
              <TextField label="Disponibilidade" value={draft.commission.availability} maxLength={100} help="Exemplo: Commissions open." onChange={(value) => update(["commission", "availability"], value)} />
              <TextArea label="Titulo" value={draft.commission.title} maxLength={160} help="Chamada grande da secao." onChange={(value) => update(["commission", "title"], value)} />
              <TextArea label="Texto" value={draft.commission.text} maxLength={600} help="Explique como entrar em contato." onChange={(value) => update(["commission", "text"], value)} />
              <TextArea label="Mensagem depois que a pessoa envia o email" value={draft.commission.successMessage} maxLength={180} help="Mensagem de confirmacao mostrada na tela." onChange={(value) => update(["commission", "successMessage"], value)} />
            </div>
          </AdminSection>
        ) : null}
      </section>
    </main>
  );
}
