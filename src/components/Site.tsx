import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArtFrame } from "./ArtFrame";
import type {
  FeaturedItem,
  PortfolioItem,
  ProcessStep,
  SiteContent,
} from "../types";

type SiteProps = {
  content: SiteContent;
  loading: boolean;
};

function splitLines(text: string) {
  return text.split("\n").filter(Boolean);
}

function useReveal(dependency: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".reveal, .reveal-clip"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [dependency]);
}

function useParallax(dependency: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (!els.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        const vh = window.innerHeight;
        els.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const speed = Number.parseFloat(el.dataset.parallax || "0.1");
          const center = rect.top + rect.height / 2 - vh / 2;
          el.style.transform = `translate3d(0, ${(-center * speed).toFixed(1)}px, 0)`;
        });
        raf = 0;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dependency]);
}

function Nav({ content }: { content: SiteContent }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const links = [
    ["Portfolio", "#portfolio"],
    ["Featured", "#featured"],
    ["About", "#about"],
    ["Process", "#process"],
    ["Commissions", "#commissions"],
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <a className="brand" href="#top">
          <span className="brand__mark">{content.branding.name}</span>
          <span className="brand__tag">{content.branding.tag}</span>
        </a>
        <div className="nav__links">
          {links.map(([label, href]) => (
            <a className="nav__link" href={href} key={href}>
              {label}
            </a>
          ))}
          <a className="btn btn--solid btn--sm" href="#commissions">
            Commission <span className="arrow">→</span>
          </a>
        </div>
        <button
          className={`nav__burger ${open ? "open" : ""}`}
          onClick={() => setOpen((value) => !value)}
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <span />
          <span />
          <span />
        </button>
      </nav>
      <div
        className={`mobile-menu ${open ? "open" : ""}`}
        id="mobile-menu"
        aria-hidden={!open}
        inert={!open ? true : undefined}
      >
        {links.map(([label, href]) => (
          <a href={href} key={href} onClick={() => setOpen(false)}>
            {label}
          </a>
        ))}
        <div className="mm-meta mono">{content.branding.instagramHandle} - Comic Artist</div>
      </div>
    </>
  );
}

function Hero({ content }: { content: SiteContent }) {
  const [k1, k2, k3] = content.hero.kicker;
  const titleLines = content.hero.titleLines.length ? content.hero.titleLines : ["Tarso", "Art"];

  return (
    <header className="hero hero--panels" data-screen-label="Hero">
      <ConstructionLines />
      <div className="wrap hero__grid">
        <div>
          <div className="hero__kicker mono">
            {[k1, k2, k3].filter(Boolean).map((item) => (
              <span className="hero__kicker-item" key={item}>
                <span>{item}</span>
                <span className="dot" />
              </span>
            ))}
          </div>
          <h1 className="hero__title">
            {titleLines.map((line, index) => (
              <span className="ln" key={`${line}-${index}`}>
                <span className={index === content.hero.strokeLineIndex ? "stroke" : ""}>
                  {line}
                </span>
              </span>
            ))}
          </h1>
          <p className="hero__sub">{content.hero.subtitle}</p>
          <div className="hero__cta">
            <a className="btn btn--solid" href="#portfolio">
              View Portfolio <span className="arrow">→</span>
            </a>
            <div className="hero__socials">
              <a
                className="btn btn--ghost"
                href={content.branding.instagramUrl}
                target="_blank"
                rel="noopener"
              >
                Follow on Instagram
              </a>
              <a
                className="btn btn--ghost"
                href={content.branding.tiktokUrl}
                target="_blank"
                rel="noopener"
              >
                Follow on TikTok
              </a>
            </div>
            <a className="btn btn--text" href="#commissions">
              Request a Commission <span className="arrow">→</span>
            </a>
          </div>
          <HeroTags tags={content.hero.tags} />
        </div>
        <div className="hero__panels" data-parallax="0.06">
          {content.hero.mainImageUrl ? (
            <div className="hp hp1 hp--main">
              <ArtFrame
                variant="ink"
                category="Hero"
                description="Main artwork"
                label="MAIN"
                imageUrl={content.hero.mainImageUrl}
                imageAlt={content.hero.mainImageAlt}
                mediaType={content.hero.mainMediaType}
                imagePlacement={content.hero.mainImagePlacement}
                imageOverlay={content.hero.mainImageOverlay}
                imageLoading="eager"
                fetchPriority="high"
              />
            </div>
          ) : (
            <>
              <div className="hp hp1">
                <ArtFrame variant="ink" category="Action Panel" description="Dynamic full-figure action - your hero shot" label="01" />
              </div>
              <div className="hp hp2">
                <ArtFrame variant="graphite" category="Sketch" description="Face / expression study" label="02" />
              </div>
              <div className="hp hp3">
                <ArtFrame variant="ink" category="Ink Study" description="Inked detail panel" label="03" />
              </div>
              <div className="hp hp4">
                <ArtFrame variant="graphite" category="Original Character" description="Character concept - pencil" label="04" />
              </div>
            </>
          )}
        </div>
      </div>
      <div className="scroll-hint mono-sm">
        <span className="bar" />
        <span>Scroll - Selected Work</span>
      </div>
    </header>
  );
}

function HeroTags({ tags }: { tags: string[] }) {
  return (
    <div className="hero__tags">
      {tags.map((tag) => (
        <span className="tag" key={tag}>
          <span className="tick" />
          {tag}
        </span>
      ))}
    </div>
  );
}

function ConstructionLines() {
  return (
    <svg className="hero__bg-lines" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {Array.from({ length: 22 }).map((_, index) => {
        const vx = 1180;
        const vy = 240;
        const angle = (index / 22) * Math.PI * 2;
        const x2 = vx + Math.cos(angle) * 2200;
        const y2 = vy + Math.sin(angle) * 2200;
        return (
          <line
            key={index}
            x1={vx}
            y1={vy}
            x2={x2}
            y2={y2}
            stroke="rgba(17,19,24,0.06)"
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}

function Marquee({ items }: { items: string[] }) {
  const row = (
    <div className="marquee__item">
      {items.map((item) => (
        <span className="marquee__piece" key={item}>
          <span>{item}</span>
          <span className="star">✶</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee__track">
        {row}
        {row}
      </div>
    </div>
  );
}

function Gallery({ content }: { content: SiteContent }) {
  const [filter, setFilter] = useState("All");
  const [activeIndex, setActiveIndex] = useState(-1);
  const filters = useMemo(() => {
    const categories = content.portfolio.items.map((item) => item.category).filter(Boolean);
    return Array.from(new Set(["All", ...categories]));
  }, [content.portfolio.items]);
  const list = useMemo(() => {
    return filter === "All"
      ? content.portfolio.items
      : content.portfolio.items.filter((item) => item.category === filter);
  }, [content.portfolio.items, filter]);
  const active = activeIndex >= 0 ? list[activeIndex] : null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!active || !list.length) return;
      if (event.key === "Escape") setActiveIndex(-1);
      if (event.key === "ArrowRight") setActiveIndex((index) => (index + 1) % list.length);
      if (event.key === "ArrowLeft") setActiveIndex((index) => (index - 1 + list.length) % list.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, list.length]);

  return (
    <section className="section" id="portfolio" data-screen-label="Portfolio Gallery">
      <div className="wrap">
        <div className="gallery__head">
          <div>
            <Eyebrow index="01" text={content.portfolio.eyebrow} />
            <h2 className="section-title reveal">{splitLines(content.portfolio.title).map((line) => <span key={line}>{line}</span>)}</h2>
          </div>
          <div className="filters" role="toolbar" aria-label="Portfolio filters">
            {filters.map((item) => (
              <button
                key={item}
                className={`filter ${filter === item ? "active" : ""}`}
                aria-pressed={filter === item}
                onClick={() => {
                  setFilter(item);
                  setActiveIndex(-1);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="grid">
          {list.map((item, index) => (
            <PortfolioCard item={item} index={index} onOpen={() => setActiveIndex(index)} key={item.id} />
          ))}
        </div>
      </div>
      <Lightbox
        active={active}
        listLength={list.length}
        brand={content.branding}
        onClose={() => setActiveIndex(-1)}
        onPrev={() => setActiveIndex((index) => (index - 1 + list.length) % list.length)}
        onNext={() => setActiveIndex((index) => (index + 1) % list.length)}
      />
    </section>
  );
}

function PortfolioCard({
  item,
  index,
  onOpen,
}: {
  item: PortfolioItem;
  index: number;
  onOpen: () => void;
}) {
  return (
    <article
      className={`cell ${item.span} reveal`}
      style={{ transitionDelay: `${(index % 6) * 60}ms` }}
    >
      <button className="cell__link" onClick={onOpen} aria-label={`View ${item.title}`}>
        <ArtFrame
          variant={item.variant}
          category={item.category}
          description={item.description}
          label={`#${String(index + 1).padStart(2, "0")}`}
          imageUrl={item.imageUrl}
          imageAlt={item.imageAlt}
          mediaType={item.mediaType}
          imagePlacement={item.imagePlacement}
          imageOverlay={item.imageOverlay}
          zoom
        />
        <div className="cover">
          <span className="c-num mono">#{String(index + 1).padStart(2, "0")}</span>
          <span className="c-cat">{item.category}</span>
          <span className="c-title">{item.title}</span>
          <span className="c-view">
            View Panel <span>→</span>
          </span>
        </div>
      </button>
    </article>
  );
}

function Lightbox({
  active,
  listLength,
  brand,
  onClose,
  onPrev,
  onNext,
}: {
  active: PortfolioItem | null;
  listLength: number;
  brand: SiteContent["branding"];
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className={`lightbox ${active ? "open" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-hidden={!active}
      inert={!active ? true : undefined}
    >
      <button className="lightbox__close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {listLength > 1 ? (
        <>
          <button className="lightbox__nav prev" onClick={onPrev} aria-label="Previous">
            ←
          </button>
          <button className="lightbox__nav next" onClick={onNext} aria-label="Next">
            →
          </button>
        </>
      ) : null}
      {active ? (
        <div className="lightbox__panel">
          <ArtFrame
            variant={active.variant}
            category={active.category}
            description={active.description}
            label="HI-RES"
            imageUrl={active.imageUrl}
            imageAlt={active.imageAlt}
            mediaType={active.mediaType}
            imagePlacement={active.imagePlacement}
            imageOverlay={active.imageOverlay}
            imageLoading="eager"
            fetchPriority="high"
          />
          <div className="lightbox__meta">
            <div>
              <div className="lc">{active.category}</div>
              <div className="lt">{active.title}</div>
            </div>
            <a className="btn btn--ghost btn--sm" href={brand.instagramUrl} target="_blank" rel="noopener">
              See on Instagram →
            </a>
          </div>
          <div className="lightbox__hint">← / → to navigate · Esc to close</div>
        </div>
      ) : null}
    </div>
  );
}

function Featured({ content }: { content: SiteContent }) {
  return (
    <section className="section section--muted" id="featured" data-screen-label="Featured Work">
      <div className="wrap">
        <Eyebrow index="02" text={content.featured.eyebrow} />
        <h2 className="section-title reveal">{splitLines(content.featured.title).map((line) => <span key={line}>{line}</span>)}</h2>
        <div className="feat">
          {content.featured.items.map((item) => (
            <FeaturedCard item={item} key={item.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedCard({ item }: { item: FeaturedItem }) {
  return (
    <article className="feat__item">
      <div className="feat__media reveal-clip">
        <ArtFrame
          variant={item.variant}
          category={item.category}
          description={item.description}
          label={`FEAT ${item.number}`}
          imageUrl={item.imageUrl}
          imageAlt={item.imageAlt}
          mediaType={item.mediaType}
          imagePlacement={item.imagePlacement}
          imageOverlay={item.imageOverlay}
          zoom
        />
      </div>
      <div className="feat__copy reveal">
        <div className="feat__no">{item.number}</div>
        <div className="feat__cat mono">{item.category}</div>
        <h3 className="feat__title">{item.title}</h3>
        <p className="feat__desc">{item.description}</p>
        <div className="feat__meta">
          {item.meta.map((meta) => (
            <div className="m" key={meta.label}>
              <span className="k">{meta.label}</span>
              <span className="v">{meta.value}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function Statement({ content }: { content: SiteContent }) {
  return (
    <section className="section statement" id="about" data-screen-label="Artist Statement">
      <div className="wrap statement__grid">
        <div className="statement__portrait reveal">
          <div className="orbit" />
          <span className="statement__note n1">FIG. A - THE ARTIST</span>
          <span className="statement__note n2">PENCIL · INK · GRIT</span>
          <div className="ring">
            <ArtFrame
              variant="graphite"
              description="Self portrait or photo"
              label="PHOTO"
              imageUrl={content.about.imageUrl}
              imageAlt={content.about.imageAlt}
              mediaType={content.about.mediaType}
              imagePlacement={content.about.imagePlacement}
              imageOverlay={content.about.imageOverlay}
              round
            />
          </div>
        </div>
        <div className="reveal">
          <Eyebrow index="03" text={content.about.eyebrow} />
          <blockquote className="statement__quote">
            {content.about.quote} <span className="dim">{content.about.quoteMuted}</span>
          </blockquote>
          <p className="statement__body">{content.about.body}</p>
          <div className="statement__sign">- {content.about.signature}</div>
        </div>
      </div>
    </section>
  );
}

function Process({ content }: { content: SiteContent }) {
  return (
    <section className="section section--muted" id="process" data-screen-label="Process">
      <div className="wrap">
        <Eyebrow index="04" text={content.process.eyebrow} />
        <h2 className="section-title reveal">{splitLines(content.process.title).map((line) => <span key={line}>{line}</span>)}</h2>
        <div className="process__row">
          {content.process.steps.map((step, index) => (
            <ProcessCard step={step} index={index} key={step.id} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProcessCard({ step, index }: { step: ProcessStep; index: number }) {
  return (
    <div className="pcard reveal" style={{ transitionDelay: `${index * 90}ms` }}>
      <div className="pcard__paper" />
      <div className="pcard__no">{step.number}</div>
      <div className="pcard__thumb">
        <ArtFrame
          variant={step.variant}
          description={step.text}
          label=""
          imageUrl={step.imageUrl}
          imageAlt={step.imageAlt}
          mediaType={step.mediaType}
          imagePlacement={step.imagePlacement}
          imageOverlay={step.imageOverlay}
        />
      </div>
      <div className="pcard__body">
        <h3 className="pcard__title">{step.title}</h3>
        <p className="pcard__text">{step.text}</p>
      </div>
      <div className="pcard__bar" style={{ "--w": step.progress } as CSSProperties} />
    </div>
  );
}

function Commission({ content }: { content: SiteContent }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <section className="section commission" id="commissions" data-screen-label="Commission / Contact">
      <div className="commission__burst speed-lines" />
      <div className="wrap commission__inner reveal">
        <span className="commission__avail">
          <span className="pulse" />
          {content.commission.availability}
        </span>
        <h2 className="commission__title">
          {splitLines(content.commission.title).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h2>
        <p className="commission__text">{content.commission.text}</p>
        {sent ? (
          <p className="commission__ok">
            {content.commission.successMessage} <strong>{email}</strong>
          </p>
        ) : (
          <form
            className="commission__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (email.trim()) setSent(true);
            }}
          >
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button className="btn btn--solid" type="submit">
              Send <span className="arrow">→</span>
            </button>
          </form>
        )}
        <div className="commission__cta">
          <a className="btn btn--ghost" href={content.branding.instagramUrl} target="_blank" rel="noopener">
            Send Message on Instagram
          </a>
          <a className="btn btn--ghost" href={content.branding.tiktokUrl} target="_blank" rel="noopener">
            Follow on TikTok
          </a>
          <a className="btn btn--text" href={`mailto:${content.branding.email}`}>
            {content.branding.email} →
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer({ content }: { content: SiteContent }) {
  return (
    <footer className="footer" data-screen-label="Footer">
      <div className="wrap">
        <div className="footer__big reveal-clip">{content.branding.name}</div>
        <div className="footer__cols">
          <div className="footer__links">
            <a href={content.branding.instagramUrl} target="_blank" rel="noopener">
              Instagram
            </a>
            <a href={content.branding.tiktokUrl} target="_blank" rel="noopener">
              TikTok
            </a>
            <a href="#portfolio">Portfolio</a>
            <a href="#commissions">Contact</a>
          </div>
          <div className="footer__copy">© {content.footer.copyright}</div>
        </div>
      </div>
    </footer>
  );
}

function Eyebrow({ index, text }: { index: string; text: string }) {
  return (
    <div className="eyebrow mono">
      <span className="idx">{index}</span>
      <span className="rule" />
      <span>{text}</span>
    </div>
  );
}

export function Site({ content, loading }: SiteProps) {
  useReveal(content);
  useParallax(content);

  return (
    <div id="top" className={loading ? "is-loading" : ""}>
      <Nav content={content} />
      <Hero content={content} />
      <Marquee items={content.hero.tags} />
      <Gallery content={content} />
      <Featured content={content} />
      <Statement content={content} />
      <Process content={content} />
      <Commission content={content} />
      <Footer content={content} />
    </div>
  );
}
