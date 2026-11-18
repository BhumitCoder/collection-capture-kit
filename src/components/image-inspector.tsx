import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  FileImage,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  analyzeImage,
  createMetadataFreeCopy,
  downloadImage,
  formatBytes,
  metadataFreeFilename,
  type ImageAuditReport,
} from "@/lib/image-forensics";

type InspectedImage = {
  id: string;
  file: File;
  previewUrl: string;
  report?: ImageAuditReport;
  error?: string;
  cleanError?: string;
  cleaning?: boolean;
};

const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|gif|avif|bmp|tiff?|svg|heic|heif)$/i;

function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (!file.type && IMAGE_EXTENSION_PATTERN.test(file.name)) return true;
  return false;
}

function releaseEntry(entry: InspectedImage) {
  URL.revokeObjectURL(entry.previewUrl);
  if (entry.report?.thumbnail) URL.revokeObjectURL(entry.report.thumbnail);
}

export function ImageInspector() {
  const [images, setImages] = useState<InspectedImage[]>([]);
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  const activeIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const dragDepthRef = useRef(0);

  imagesRef.current = images;
  const analyzing = analyzingCount > 0;

  useEffect(() => {
    mountedRef.current = true;
    const activeIds = activeIdsRef.current;
    return () => {
      mountedRef.current = false;
      activeIds.clear();
      imagesRef.current.forEach(releaseEntry);
    };
  }, []);

  const inspectFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);
    const imageFiles = files.filter(isLikelyImageFile);
    setUploadError(files.length > imageFiles.length ? "Only image files can be inspected." : "");
    if (imageFiles.length === 0) return;

    const batch: InspectedImage[] = imageFiles.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    batch.forEach((entry) => activeIdsRef.current.add(entry.id));
    setImages((current) => [...current, ...batch]);
    setAnalyzingCount((count) => count + 1);

    try {
      for (const entry of batch) {
        if (!mountedRef.current || !activeIdsRef.current.has(entry.id)) continue;
        try {
          const report = await analyzeImage(entry.file, entry.file.name, entry.file.lastModified);
          if (!mountedRef.current || !activeIdsRef.current.has(entry.id)) {
            if (report.thumbnail) URL.revokeObjectURL(report.thumbnail);
            continue;
          }
          setImages((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, report } : item)),
          );
        } catch (cause) {
          if (!mountedRef.current || !activeIdsRef.current.has(entry.id)) continue;
          const message =
            cause instanceof Error ? cause.message : "This image could not be inspected.";
          setImages((current) =>
            current.map((item) => (item.id === entry.id ? { ...item, error: message } : item)),
          );
        }
      }
    } finally {
      if (mountedRef.current) {
        setAnalyzingCount((count) => Math.max(0, count - 1));
      }
    }
  };

  const clearImages = () => {
    activeIdsRef.current.clear();
    imagesRef.current.forEach(releaseEntry);
    setImages([]);
    setUploadError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (entry: InspectedImage) => {
    activeIdsRef.current.delete(entry.id);
    releaseEntry(entry);
    setImages((current) => current.filter((item) => item.id !== entry.id));
  };

  const makeCleanCopy = async (entry: InspectedImage) => {
    setImages((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, cleaning: true, cleanError: "" } : item,
      ),
    );
    try {
      const cleanCopy = await createMetadataFreeCopy(entry.file, entry.file.type);
      if (!mountedRef.current) return;
      downloadImage(cleanCopy, metadataFreeFilename(entry.file.name, entry.file.type));
    } catch (cause) {
      if (!mountedRef.current) return;
      const message = cause instanceof Error ? cause.message : "A clean copy could not be created.";
      setImages((current) =>
        current.map((item) => (item.id === entry.id ? { ...item, cleanError: message } : item)),
      );
    } finally {
      if (mountedRef.current) {
        setImages((current) =>
          current.map((item) => (item.id === entry.id ? { ...item, cleaning: false } : item)),
        );
      }
    }
  };

  return (
    <main
      className={`inspector-view ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setIsDragging(false);
        void inspectFiles(event.dataTransfer.files);
      }}
    >
      <div className="inspector-heading">
        <div>
          <div className="eyebrow">PRIVATE · ON THIS DEVICE</div>
          <h1>Image details &amp; clean copies</h1>
          <p>Inspect each image’s embedded information, then make a fresh copy without metadata.</p>
        </div>
        <div className="inspector-actions">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            aria-label="Choose images to inspect"
            onChange={(event) => {
              void inspectFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
          <Button onClick={() => inputRef.current?.click()}>
            {analyzing ? <LoaderCircle className="animate-spin" /> : <Upload />} Add images
          </Button>
          <Button variant="outline" onClick={clearImages} disabled={images.length === 0}>
            <Trash2 /> Clear all
          </Button>
        </div>
      </div>

      <div className="inspector-privacy">
        <LockKeyhole aria-hidden="true" /> Your image files are read and processed in this browser;
        they are never uploaded.
      </div>

      {images.length === 0 ? (
        <div className={`inspector-dropzone ${isDragging ? "is-dragging" : ""}`}>
          <span className="inspector-upload-mark">
            <FileImage aria-hidden="true" />
          </span>
          <h2>{isDragging ? "Drop images to inspect" : "Choose images to inspect"}</h2>
          <p>
            Drag &amp; drop files anywhere here, or browse to inspect metadata, image fingerprints,
            colors, file structure, and embedded details.
          </p>
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload /> Choose image files
          </Button>
          {uploadError && (
            <p className="inspector-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="inspector-list-heading">
            <div>
              <h2>Images</h2>
              <span>
                {images.length} file{images.length === 1 ? "" : "s"}
              </span>
            </div>
            {analyzing && (
              <span className="inspector-running">
                <LoaderCircle className="animate-spin" /> Reading image details…
              </span>
            )}
          </div>
          {uploadError && (
            <div className="inspector-error" role="alert">
              {uploadError}
            </div>
          )}
          <div className="inspected-images">
            {images.map((entry) => {
              const report = entry.report;
              const histogramValues = report?.colors.histogram.map(Number) ?? [];
              const histogramMax = Math.max(...histogramValues, 1);
              return (
                <article className="inspected-image" key={entry.id}>
                  <div className="inspected-image-head">
                    <img
                      className="inspected-preview"
                      src={entry.previewUrl}
                      alt={`Preview of ${entry.file.name}`}
                    />
                    <div className="inspected-file-info">
                      <div className="eyebrow">
                        {report?.format ?? (entry.file.type || "IMAGE FILE")}
                      </div>
                      <h3>{entry.file.name}</h3>
                      <p>
                        {formatBytes(entry.file.size)} <span>·</span>{" "}
                        {report?.dimensions ?? "Reading dimensions…"}
                        {report && report.megapixels !== "Unavailable" ? (
                          <>
                            {" "}
                            <span>·</span> {report.megapixels}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="inspected-actions">
                      <Button
                        onClick={() => void makeCleanCopy(entry)}
                        disabled={!report || Boolean(entry.cleaning || entry.error)}
                      >
                        {entry.cleaning ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                        {entry.cleaning ? "Creating…" : "Create clean copy"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${entry.file.name}`}
                        title="Remove image"
                        onClick={() => removeImage(entry)}
                      >
                        <X />
                      </Button>
                    </div>
                  </div>
                  {entry.error ? (
                    <p className="inspector-error" role="alert">
                      {entry.error}
                    </p>
                  ) : null}
                  {entry.cleanError ? (
                    <p className="inspector-error" role="alert">
                      {entry.cleanError}
                    </p>
                  ) : null}
                  {report ? (
                    <>
                      <div className="audit-color-summary">
                        <div className="audit-color-title">
                          <strong>Color analysis</strong>
                          <span>Average RGB {report.colors.averageRgb}</span>
                        </div>
                        <div className="audit-palette">
                          {report.colors.palette.map((color, index) => (
                            <div className="audit-swatch" key={`${color.hex}-${index}`}>
                              <span
                                className="audit-swatch-color"
                                style={{ backgroundColor: color.hex }}
                              />
                              <span>{color.hex}</span>
                              <small>{color.share}%</small>
                            </div>
                          ))}
                        </div>
                        <div
                          className="audit-histogram"
                          aria-label={`Image luminance histogram: ${report.colors.histogram.join(", ")}`}
                        >
                          {report.colors.histogram.map((value, index) => (
                            <span
                              key={index}
                              title={`${value} pixels`}
                              style={{
                                height: `${Math.max(4, (Number(value) / histogramMax) * 100)}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="audit-sections">
                        {report.sections.map((section) => (
                          <section className="audit-section" key={section.title}>
                            <div className="audit-section-title">
                              <h4>{section.title}</h4>
                              {section.note && <p>{section.note}</p>}
                            </div>
                            <dl>
                              {section.values.map((item, index) => (
                                <div className="audit-value" key={`${item.label}-${index}`}>
                                  <dt>{item.label}</dt>
                                  <dd>{item.value}</dd>
                                </div>
                              ))}
                            </dl>
                            {section.title === "Embedded thumbnail" && report.thumbnail && (
                              <img
                                className="audit-embedded-thumbnail"
                                src={report.thumbnail}
                                alt="Embedded image thumbnail"
                              />
                            )}
                          </section>
                        ))}
                      </div>
                      <div className="inspector-clean-note">
                        <ArrowDownToLine aria-hidden="true" /> {report.clearCopyNote}
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="inspector-add-more">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload /> Add more images
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
