import type { CSSProperties } from "react";
import { resolveAssetUrl } from "../lib/api";
import type { ArtVariant, ImagePlacement } from "../types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeImagePlacement(placement?: ImagePlacement): ImagePlacement {
  return {
    x: clamp(typeof placement?.x === "number" && Number.isFinite(placement.x) ? placement.x : 50, 0, 100),
    y: clamp(typeof placement?.y === "number" && Number.isFinite(placement.y) ? placement.y : 50, 0, 100),
    zoom: clamp(
      typeof placement?.zoom === "number" && Number.isFinite(placement.zoom) ? placement.zoom : 1,
      1,
      3,
    ),
  };
}

export function ArtFrame({
  variant = "ink",
  category,
  label,
  description,
  imageUrl,
  imageAlt,
  imagePlacement,
  zoom = false,
  round = false,
}: {
  variant?: ArtVariant;
  category?: string;
  label?: string;
  description: string;
  imageUrl?: string;
  imageAlt?: string;
  imagePlacement?: ImagePlacement;
  zoom?: boolean;
  round?: boolean;
}) {
  const src = resolveAssetUrl(imageUrl);
  const placement = normalizeImagePlacement(imagePlacement);
  const imageStyle = {
    "--img-x": `${placement.x}%`,
    "--img-y": `${placement.y}%`,
    "--img-scale": String(placement.zoom),
    "--img-hover-scale": String(placement.zoom * 1.06),
  } as CSSProperties;

  return (
    <div className={`art art--${variant} ${src ? "art--image" : ""} ${round ? "art--round" : ""}`}>
      {src ? (
        <img
          className={zoom ? "art__img art__img--zoom" : "art__img"}
          src={src}
          alt={imageAlt || description}
          style={imageStyle}
        />
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
