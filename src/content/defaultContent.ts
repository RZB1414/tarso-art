import type { SiteContent } from "../types";

export const DEFAULT_CONTENT: SiteContent = {
  branding: {
    name: "TARSO",
    tag: "/ ART",
    instagramUrl: "https://instagram.com/tarso.art",
    instagramHandle: "@tarso.art",
    tiktokUrl: "https://www.tiktok.com/@tarso.art",
    tiktokHandle: "@tarso.art",
    email: "hello@tarso.art",
  },
  hero: {
    kicker: ["Comic Artist", "Visual Storyteller", "@tarso.art"],
    titleLines: ["Stories", "Drawn With", "Ink, Motion", "& Emotion"],
    strokeLineIndex: 2,
    subtitle:
      "Comic artist creating original characters, fan art and cinematic action panels.",
    tags: [
      "Original Characters",
      "Fan Art",
      "Comic Panels",
      "Sketches",
      "Ink & Pencil",
    ],
    layout: "panels",
  },
  portfolio: {
    eyebrow: "Selected Work",
    title: "The\nPortfolio",
    filters: [
      "All",
      "Original Characters",
      "Fan Art",
      "Action Panels",
      "Sketches",
      "Ink Studies",
      "Comic Panels",
    ],
    items: [
      {
        id: "vengeance-rider",
        title: "Vengeance Rider",
        category: "Action Panels",
        variant: "ink",
        span: "s-a",
        description:
          "Full-figure flaming antihero, dynamic anatomy, heavy ink shadows",
      },
      {
        id: "eye-of-the-storm",
        title: "Eye of the Storm",
        category: "Sketches",
        variant: "graphite",
        span: "s-c",
        description: "Close-up expression study, graphite",
      },
      {
        id: "iron-resolve",
        title: "Iron Resolve",
        category: "Original Characters",
        variant: "graphite",
        span: "s-b",
        description: "Original armored character, 3/4 pose",
      },
      {
        id: "first-strike",
        title: "First Strike",
        category: "Action Panels",
        variant: "ink",
        span: "s-e",
        description: "Foreshortened punch panel, speed lines",
      },
      {
        id: "web-of-lines",
        title: "Web of Lines",
        category: "Fan Art",
        variant: "ink",
        span: "s-f",
        description: "Fan-art hero mid-swing, motion blur",
      },
      {
        id: "construction",
        title: "Construction",
        category: "Ink Studies",
        variant: "graphite",
        span: "s-d",
        description: "Anatomy & gesture page, construction lines",
      },
      {
        id: "cowl-cape",
        title: "Cowl & Cape",
        category: "Fan Art",
        variant: "ink",
        span: "s-b",
        description: "Brooding caped figure, rim light",
      },
      {
        id: "origin-page",
        title: "Origin Page",
        category: "Comic Panels",
        variant: "graphite",
        span: "s-g",
        description: "Multi-panel sequential page layout",
      },
      {
        id: "blade-dancer",
        title: "Blade Dancer",
        category: "Original Characters",
        variant: "ink",
        span: "s-c",
        description: "Dual-wield warrior, flowing cloth",
      },
    ],
  },
  featured: {
    eyebrow: "Featured Artwork",
    title: "Three\nStandouts",
    items: [
      {
        id: "hellfire-rider",
        number: "01",
        category: "Action Panel",
        title: "Hellfire Rider",
        description:
          "High-impact action scene with dynamic anatomy, dramatic lighting and expressive movement.",
        variant: "ink",
        meta: [
          { label: "Medium", value: "Ink + Digital" },
          { label: "Format", value: "Splash Page" },
          { label: "Year", value: "2026" },
        ],
      },
      {
        id: "the-ironclad",
        number: "02",
        category: "Original Character",
        title: "The Ironclad",
        description:
          "An original character study exploring weight, armor and silhouette.",
        variant: "graphite",
        meta: [
          { label: "Medium", value: "Graphite" },
          { label: "Format", value: "Character Sheet" },
          { label: "Year", value: "2026" },
        ],
      },
      {
        id: "origin-page-one",
        number: "03",
        category: "Comic Sequence",
        title: "Origin: Page One",
        description:
          "A sequential page where pacing, panel rhythm and camera angles land the emotional beat.",
        variant: "ink",
        meta: [
          { label: "Medium", value: "Ink" },
          { label: "Format", value: "Sequential" },
          { label: "Year", value: "2025" },
        ],
      },
    ],
  },
  about: {
    eyebrow: "Artist Statement",
    quote: "I bring stories to life,",
    quoteMuted: "one panel at a time.",
    body:
      "My work explores action, emotion and character-driven visual storytelling through pencil, ink and comic-inspired compositions.",
    signature: "Tarso",
  },
  process: {
    eyebrow: "From Blank Page to Final Panel",
    title: "The\nProcess",
    steps: [
      {
        id: "sketch",
        number: "01",
        title: "Sketch",
        text: "Loose thumbnails and gesture. Finding the pose, energy and story beat before any detail.",
        progress: "25%",
        variant: "graphite",
      },
      {
        id: "composition",
        number: "02",
        title: "Anatomy & Composition",
        text: "Construction lines, proportion and panel layout. Building a believable figure that reads at a glance.",
        progress: "50%",
        variant: "graphite",
      },
      {
        id: "ink",
        number: "03",
        title: "Ink / Line Work",
        text: "Confident inking, line weight and spotting blacks. Where the drawing gets its punch and contrast.",
        progress: "75%",
        variant: "ink",
      },
      {
        id: "final",
        number: "04",
        title: "Final Artwork",
        text: "Halftones, rendering and finishing. The polished panel ready to print, post or publish.",
        progress: "100%",
        variant: "ink",
      },
    ],
  },
  commission: {
    availability: "Open for commissions - 2026",
    title: "Want a Custom\nArtwork?",
    text:
      "Available for commissions, character concepts, comic panels, covers and personal projects.",
    successMessage:
      "Recebi seu email. Para respostas mais rapidas, envie DM no Instagram.",
  },
  footer: {
    copyright: "Tarso Art - Comic Artist & Visual Storyteller",
  },
};
