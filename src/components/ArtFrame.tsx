import { useEffect, useRef, useState, type CSSProperties } from "react";
import { resolveAssetUrl } from "../lib/api";
import type { ArtVariant, ImageOverlayStyle, ImagePlacement, MediaType } from "../types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const IMAGE_ZOOM_MIN = 0.25;
export const IMAGE_ZOOM_MAX = 3;
export const DEFAULT_IMAGE_OVERLAY: ImageOverlayStyle = {
  textColor: "#ffffff",
  backgroundColor: "#111318",
  backgroundOpacity: 0,
  backgroundBlur: 0,
};

export function normalizeImagePlacement(placement?: ImagePlacement): ImagePlacement {
  return {
    x: clamp(typeof placement?.x === "number" && Number.isFinite(placement.x) ? placement.x : 50, 0, 100),
    y: clamp(typeof placement?.y === "number" && Number.isFinite(placement.y) ? placement.y : 50, 0, 100),
    zoom: clamp(
      typeof placement?.zoom === "number" && Number.isFinite(placement.zoom) ? placement.zoom : 1,
      IMAGE_ZOOM_MIN,
      IMAGE_ZOOM_MAX,
    ),
  };
}

function cleanHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function hexToRgbTriplet(hex: string): string {
  const clean = cleanHexColor(hex, DEFAULT_IMAGE_OVERLAY.backgroundColor).slice(1);
  const value = Number.parseInt(clean, 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

export function normalizeImageOverlay(overlay?: ImageOverlayStyle): ImageOverlayStyle {
  return {
    textColor: cleanHexColor(overlay?.textColor, DEFAULT_IMAGE_OVERLAY.textColor),
    backgroundColor: cleanHexColor(overlay?.backgroundColor, DEFAULT_IMAGE_OVERLAY.backgroundColor),
    backgroundOpacity: clamp(
      typeof overlay?.backgroundOpacity === "number" && Number.isFinite(overlay.backgroundOpacity)
        ? overlay.backgroundOpacity
        : DEFAULT_IMAGE_OVERLAY.backgroundOpacity,
      0,
      100,
    ),
    backgroundBlur: clamp(
      typeof overlay?.backgroundBlur === "number" && Number.isFinite(overlay.backgroundBlur)
        ? overlay.backgroundBlur
        : DEFAULT_IMAGE_OVERLAY.backgroundBlur,
      0,
      30,
    ),
  };
}

function inferMediaType(src?: string, mediaType?: MediaType): MediaType {
  if (mediaType === "video" || mediaType === "image") return mediaType;
  return /\.(mp4|webm)(?:$|\?)/i.test(src || "") ? "video" : "image";
}

export function ArtFrame({
  variant = "ink",
  category,
  label,
  description,
  imageUrl,
  imageAlt,
  mediaType,
  imagePlacement,
  imageOverlay,
  imageLoading = "lazy",
  fetchPriority = imageLoading === "eager" ? "high" : "low",
  zoom = false,
  round = false,
}: {
  variant?: ArtVariant;
  category?: string;
  label?: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  mediaType?: MediaType;
  imagePlacement?: ImagePlacement;
  imageOverlay?: ImageOverlayStyle;
  imageLoading?: "eager" | "lazy";
  fetchPriority?: "high" | "low" | "auto";
  zoom?: boolean;
  round?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const src = resolveAssetUrl(imageUrl);
  const resolvedMediaType = inferMediaType(src, mediaType);
  const [videoActive, setVideoActive] = useState(imageLoading === "eager");
  const placement = normalizeImagePlacement(imagePlacement);
  const overlay = normalizeImageOverlay(imageOverlay);
  const frameStyle = {
    "--img-x": `${placement.x}%`,
    "--img-y": `${placement.y}%`,
    "--img-scale": String(placement.zoom),
    "--img-hover-scale": String(placement.zoom * 1.06),
    "--overlay-text-color": overlay.textColor,
    "--overlay-bg-rgb": hexToRgbTriplet(overlay.backgroundColor),
    "--overlay-bg-opacity": String(overlay.backgroundOpacity / 100),
    "--overlay-bg-blur": `${overlay.backgroundBlur}px`,
  } as CSSProperties;
  const hasMedia = Boolean(src);
  const videoSrc = resolvedMediaType === "video" && (imageLoading === "eager" || videoActive) ? src : undefined;

  useEffect(() => {
    if (!src || resolvedMediaType !== "video") return;
    if (imageLoading === "eager") {
      setVideoActive(true);
      return;
    }

    setVideoActive(false);
    const element = frameRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setVideoActive(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVideoActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px", threshold: 0.01 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [imageLoading, resolvedMediaType, src]);

  return (
    <div
      className={`art art--${variant} ${hasMedia ? "art--image" : ""} ${resolvedMediaType === "video" ? "art--video" : ""} ${round ? "art--round" : ""}`}
      style={frameStyle}
      ref={frameRef}
    >
      {src ? (
        resolvedMediaType === "video" ? (
          <video
            className={zoom ? "art__media art__video art__media--zoom" : "art__media art__video"}
            src={videoSrc}
            aria-label={imageAlt || description}
            autoPlay
            muted
            loop
            playsInline
            preload={imageLoading === "eager" ? "auto" : "metadata"}
          />
        ) : (
          <img
            className={zoom ? "art__media art__img art__media--zoom" : "art__media art__img"}
            src={src}
            alt={imageAlt || description}
            loading={imageLoading}
            decoding="async"
            fetchPriority={fetchPriority}
          />
        )
      ) : (
        <>
          <div className="art__fill" />
          <div className="art__hatch" />
          <div className="art__guide" />
        </>
      )}
      {label ? <span className="art__drop">{label}</span> : null}
      {!src ? (
        <>
          <span className="crop tl" />
          <span className="crop tr" />
          <span className="crop bl" />
          <span className="crop br" />
        </>
      ) : null}
      <div className="art__label">
        {category ? <span className="art__cat">{category}</span> : null}
        <span className="art__what">{description}</span>
      </div>
    </div>
  );
}
