import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { resolveAssetUrl, uploadImage } from "../lib/api";
import type { ImagePlacement } from "../types";
import { ArtFrame, IMAGE_ZOOM_MAX, IMAGE_ZOOM_MIN, normalizeImagePlacement } from "./ArtFrame";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  help,
  maxLength,
  inputMode,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "email" | "password" | "text" | "url";
  help?: string;
  maxLength?: number;
  inputMode?: "email" | "numeric" | "text" | "url";
  autoComplete?: string;
}) {
  return (
    <label className="admin-field">
      <span className="admin-field__label">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldHelp help={help} value={value} maxLength={maxLength} />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 4,
  help,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  help?: string;
  maxLength?: number;
}) {
  return (
    <label className="admin-field">
      <span className="admin-field__label">{label}</span>
      <textarea rows={rows} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
      <FieldHelp help={help} value={value} maxLength={maxLength} />
    </label>
  );
}

function FieldHelp({ help, value, maxLength }: { help?: string; value: string; maxLength?: number }) {
  if (!help && !maxLength) return null;
  return (
    <small className="admin-field__help">
      {help ? <span>{help}</span> : null}
      {maxLength ? <span>{value.length}/{maxLength}</span> : null}
    </small>
  );
}

export function ImageField({
  label,
  value,
  alt,
  placement,
  preview,
  help,
  onImageChange,
  onPlacementChange,
}: {
  label: string;
  value?: string;
  alt?: string;
  placement?: ImagePlacement;
  preview: {
    className: string;
    variant?: "ink" | "graphite";
    category?: string;
    description: string;
    label?: string;
    round?: boolean;
    zoom?: boolean;
  };
  help?: string;
  onImageChange: (url?: string, alt?: string) => void;
  onPlacementChange: (placement?: ImagePlacement) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    initial: ImagePlacement;
    width: number;
    height: number;
  } | null>(null);
  const resolved = resolveAssetUrl(value);
  const frame = normalizeImagePlacement(placement);
  const fileName = value ? decodeURIComponent(value.split("/").pop() || "imagem") : "";

  async function handleFile(file?: File) {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const result = await uploadImage(file);
      if (result.error || !result.data) {
        setError(result.error || "Erro no upload");
        return;
      }
      onImageChange(result.data.url, file.name.replace(/\.[a-z0-9]+$/i, ""));
      onPlacementChange({ x: 50, y: 50, zoom: 1 });
    } catch {
      setError("Nao foi possivel enviar a imagem. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  function changePlacement(next: Partial<ImagePlacement>) {
    onPlacementChange(normalizeImagePlacement({ ...frame, ...next }));
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!value) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: frame,
      width: rect.width || 1,
      height: rect.height || 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = ((event.clientX - current.startX) / current.width) * 100;
    const dy = ((event.clientY - current.startY) / current.height) * 100;
    onPlacementChange(
      normalizeImagePlacement({
        ...current.initial,
        x: current.initial.x + dx / current.initial.zoom,
        y: current.initial.y + dy / current.initial.zoom,
      }),
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  return (
    <div className="admin-image-field">
      <div className="admin-image-field__head">
        <div>
          <span>{label}</span>
          <small>{help || "Envie uma imagem e ajuste o enquadramento vendo exatamente como ela aparece no site."}</small>
        </div>
        <label className="admin-upload">
          {uploading ? "Enviando..." : value ? "Trocar imagem" : "Escolher imagem"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
      </div>

      <div className="admin-image-caption">
        <strong>Previa igual ao site</strong>
        <span>{value ? "Arraste a imagem ou use os controles abaixo." : "Nenhuma imagem enviada ainda."}</span>
      </div>

      <div
        className={`admin-image-preview ${preview.className} ${value ? "is-draggable" : ""}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {resolved ? (
          <ArtFrame
            variant={preview.variant || "ink"}
            category={preview.category}
            description={preview.description}
            label={preview.label}
            imageUrl={value}
            imageAlt={alt || label}
            imagePlacement={frame}
            zoom={preview.zoom}
            round={preview.round}
          />
        ) : (
          <div className="admin-image-empty">Sem imagem</div>
        )}
      </div>

      {value ? <p className="admin-image-current">Imagem atual: {fileName}</p> : null}

      {value ? (
        <div className="admin-image-controls">
          <label className="admin-range">
            <span>Zoom <b>{Math.round(frame.zoom * 100)}%</b></span>
            <input
              type="range"
              min={IMAGE_ZOOM_MIN}
              max={IMAGE_ZOOM_MAX}
              step="0.01"
              value={frame.zoom}
              onChange={(event) => changePlacement({ zoom: Number(event.target.value) })}
            />
          </label>
          <label className="admin-range">
            <span>Horizontal <b>{Math.round(frame.x)}%</b></span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={frame.x}
              onChange={(event) => changePlacement({ x: Number(event.target.value) })}
            />
          </label>
          <label className="admin-range">
            <span>Vertical <b>{Math.round(frame.y)}%</b></span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={frame.y}
              onChange={(event) => changePlacement({ y: Number(event.target.value) })}
            />
          </label>
        </div>
      ) : null}

      {value ? (
        <div className="admin-image-actions">
          <button className="admin-btn admin-btn--ghost admin-btn--fit" type="button" onClick={() => onPlacementChange({ x: 50, y: 50, zoom: 1 })}>
            Centralizar imagem
          </button>
          <button
            className="admin-btn admin-btn--ghost admin-btn--fit"
            type="button"
            onClick={() => {
              onImageChange(undefined, undefined);
              onPlacementChange(undefined);
            }}
          >
            Remover imagem
          </button>
        </div>
      ) : null}
      {error ? <p className="admin-error">{error}</p> : null}
    </div>
  );
}

export function CardEditor({
  title,
  description,
  onRemove,
  children,
}: {
  title: string;
  description?: string;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <article className="admin-card">
      <div className="admin-card__head">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {onRemove ? (
          <button className="admin-btn admin-btn--ghost" type="button" onClick={onRemove}>
            Remover
          </button>
        ) : null}
      </div>
      <div className="admin-grid">{children}</div>
    </article>
  );
}

export function AdminSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-section">
      <div className="admin-section__head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
