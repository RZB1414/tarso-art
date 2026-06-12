export type ArtVariant = "ink" | "graphite";

export type ImagePlacement = {
  x: number;
  y: number;
  zoom: number;
};

export type PortfolioItem = {
  id: string;
  title: string;
  category: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  imagePlacement?: ImagePlacement;
  span: "s-a" | "s-b" | "s-c" | "s-d" | "s-e" | "s-f" | "s-g";
  variant: ArtVariant;
};

export type FeaturedItem = {
  id: string;
  number: string;
  category: string;
  title: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  imagePlacement?: ImagePlacement;
  variant: ArtVariant;
  meta: Array<{ label: string; value: string }>;
};

export type ProcessStep = {
  id: string;
  number: string;
  title: string;
  text: string;
  progress: string;
  imageUrl?: string;
  imageAlt?: string;
  imagePlacement?: ImagePlacement;
  variant: ArtVariant;
};

export type SiteContent = {
  branding: {
    name: string;
    tag: string;
    instagramUrl: string;
    instagramHandle: string;
    tiktokUrl: string;
    tiktokHandle: string;
    email: string;
  };
  hero: {
    kicker: string[];
    titleLines: string[];
    strokeLineIndex: number;
    subtitle: string;
    tags: string[];
    layout: "panels" | "splash" | "editorial";
    mainImageUrl?: string;
    mainImageAlt?: string;
    mainImagePlacement?: ImagePlacement;
  };
  portfolio: {
    eyebrow: string;
    title: string;
    filters: string[];
    items: PortfolioItem[];
  };
  featured: {
    eyebrow: string;
    title: string;
    items: FeaturedItem[];
  };
  about: {
    eyebrow: string;
    quote: string;
    quoteMuted: string;
    body: string;
    signature: string;
    imageUrl?: string;
    imageAlt?: string;
    imagePlacement?: ImagePlacement;
  };
  process: {
    eyebrow: string;
    title: string;
    steps: ProcessStep[];
  };
  commission: {
    availability: string;
    title: string;
    text: string;
    successMessage: string;
  };
  footer: {
    copyright: string;
  };
};

export type ApiResult<T> = {
  data?: T;
  error?: string;
  code?: string;
  status?: number;
};
