import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, FileImage, LoaderCircle, LockKeyhole, Sparkles, Trash2, Upload, X } from "lucide-react";

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

function releaseEntry(entry: InspectedImage) {
  URL.revokeObjectURL(entry.previewUrl);
  if (entry.report?.thumbnail) URL.revokeObjectURL(entry.report.thumbnail);
}

export function ImageInspector() {
  const [images, setImages] = useState<InspectedImage[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;

  useEffect(() => () => imagesRef.current.forEach(releaseEntry), []);

  const inspectFiles = async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList ?? []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    setUploadError(files.length > imageFiles.length ? "Only image files can be inspected." : "");
    if (imageFiles.length === 0) return;

    const batch = imageFiles.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setImages((current) => [...current, ...batch]);
    setAnalyzing(true);
    for (const entry of batch) {
      try {
        const report = await analyzeImage(entry.file, entry.file.name, entry.file.lastModified);
        setImages((current) => current.map((item) => item.id === entry.id ? { ...item, report } : item));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "This image could not be inspected.";
        setImages((current) => current.map((item) => item.id === entry.id ? { ...item, error: message } : item));
      }
    }
    setAnalyzing(false);
  };

  const clearImages = () => {
    images.forEach(releaseEntry);
    setImages([]);
    setUploadError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeImage = (entry: InspectedImage) => {
    releaseEntry(entry);
    setImages((current) => current.filter((item) => item.id !== entry.id));
  };

  const makeCleanCopy = async (entry: InspectedImage) => {
    setImages((current) => current.map((item) => item.id === entry.id ? { ...item, cleaning: true, cleanError: "" } : item));
    try {
      const cleanCopy = await createMetadataFreeCopy(entry.file, entry.file.type);
      downloadImage(cleanCopy, metadataFreeFilename(entry.file.name, entry.file.type));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "A clean copy could not be created.";
      setImages((current) => current.map((item) => item.id === entry.id ? { ...item, cleanError: message } : item));
    } finally {
      setImages((current) => current.map((item) => item.id === entry.id ? { ...item, cleaning: false } : item));
    }
  };

  return (
    <main className="inspector-view">
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
          <Button onClick={() => inputRef.current?.click()} disabled={analyzing}>
            {analyzing ? <LoaderCircle className="animate-spin" /> : <Upload />} Add images
          </Button>
          <Button variant="outline" onClick={clearImages} disabled={images.length === 0 || analyzing}>
            <Trash2 /> Clear all
          </Button>
        </div>
      </div>

      <div className="inspector-privacy"><LockKeyhole /> Your image files are read and processed in this browser; they are never uploaded.</div>

      {images.length === 0 ? (
        <div
          className="inspector-dropzone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void inspectFiles(event.dataTransfer.files);
          }}
        >
          <span className="inspector-upload-mark"><FileImage /></span>
          <h2>Choose images to inspect</h2>
          <p>See metadata, image fingerprints, colors, file structure and available embedded details.</p>
          <Button variant="outline" onClick={() => inputRef.current?.click()}><Upload /> Choose image files</Button>
          {uploadError && <p className="inspector-error" role="alert">{uploadError}</p>}
        </div>
      ) : (
        <>
          <div className="inspector-list-heading">
            <div><h2>Images</h2><span>{images.length} file{images.length === 1 ? "" : "s"}</span></div>
            {analyzing && <span className="inspector-running"><LoaderCircle className="animate-spin" /> Reading image details…</span>}
          </div>
          {uploadError && <div className="inspector-error" role="alert">{uploadError}</div>}
          <div className="inspected-images">
            {images.map((entry) => {
              const report = entry.report;
              return (
              <article className="inspected-image" key={entry.id}>
                <div className="inspected-image-head">
                  <img className="inspected-preview" src={entry.previewUrl} alt={`Preview of ${entry.file.name}`} />
                  <div className="inspected-file-info">
                    <div className="eyebrow">{report?.format ?? (entry.file.type || "IMAGE FILE")}</div>
                    <h3>{entry.file.name}</h3>
                    <p>{formatBytes(entry.file.size)} <span>·</span> {report?.dimensions ?? "Reading dimensions…"}</p>
                  </div>
                  <div className="inspected-actions">
                    <Button onClick={() => void makeCleanCopy(entry)} disabled={!report || Boolean(entry.cleaning || entry.error)}>
                      {entry.cleaning ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                      {entry.cleaning ? "Creating…" : "Create clean copy"}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${entry.file.name}`} title="Remove image" onClick={() => removeImage(entry)} disabled={analyzing}>
                      <X />
                    </Button>
                  </div>
                </div>
                {entry.error ? <p className="inspector-error" role="alert">{entry.error}</p> : null}
                {entry.cleanError ? <p className="inspector-error" role="alert">{entry.cleanError}</p> : null}
                {report ? (
                  <>
                    <div className="audit-color-summary">
                      <div className="audit-color-title"><strong>Color analysis</strong><span>Average RGB {report.colors.averageRgb}</span></div>
                      <div className="audit-palette">
                        {report.colors.palette.map((color, index) => (
                          <div className="audit-swatch" key={`${color.hex}-${index}`}>
                            <span className="audit-swatch-color" style={{ backgroundColor: color.hex }} />
                            <span>{color.hex}</span><small>{color.share}%</small>
                          </div>
                        ))}
                      </div>
                      <div className="audit-histogram" aria-label={`Image luminance histogram: ${report.colors.histogram.join(", ")}`}>
                        {report.colors.histogram.map((value, index) => {
                          const max = Math.max(...report.colors.histogram.map(Number), 1);
                          return <span key={index} title={`${value} pixels`} style={{ height: `${Math.max(4, (Number(value) / max) * 100)}%` }} />;
                        })}
                      </div>
                    </div>
                    <div className="audit-sections">
                      {report.sections.map((section) => (
                        <section className="audit-section" key={section.title}>
                          <div className="audit-section-title"><h4>{section.title}</h4>{section.note && <p>{section.note}</p>}</div>
                          <dl>
                            {section.values.map((item, index) => (
                              <div className="audit-value" key={`${item.label}-${index}`}>
                                <dt>{item.label}</dt><dd>{item.value}</dd>
                              </div>
                            ))}
                          </dl>
                          {section.title === "Embedded thumbnail" && report.thumbnail && (
                            <img className="audit-embedded-thumbnail" src={report.thumbnail} alt="Embedded image thumbnail" />
                          )}
                        </section>
                      ))}
                    </div>
                    <div className="inspector-clean-note"><ArrowDownToLine /> {report.clearCopyNote}</div>
                  </>
                ) : null}
              </article>
              );
            })}
          </div>
          <div className="inspector-add-more"><Button variant="outline" onClick={() => inputRef.current?.click()} disabled={analyzing}><Upload /> Add more images</Button></div>
        </>
      )}
    </main>
  );
}