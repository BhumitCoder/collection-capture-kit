export type ImageDataSection = {
  title: string;
  note?: string;
  values: Array<{ label: string; value: string }>;
};

export type ImagePaletteColor = {
  hex: string;
  rgb: string;
  hsv: string;
  share: number;
};

export type ImageAuditReport = {
  filename: string;
  format: string;
  mimeType: string;
  fileSize: string;
  modifiedDate: string;
  dimensions: string;
  megapixels: string;
  resolution: string;
  cryptographicHash: string;
  perceptualHash: string;
  sections: ImageDataSection[];
  colors: { averageRgb: string; palette: ImagePaletteColor[]; histogram: string[] };
  thumbnail: string | null;
  thumbnailType: string;
  clearCopyNote: string;
};

const jpegMarkers = new Map<number, string>([
  [0xe0, "APP0 · JFIF"],
  [0xe1, "APP1 · EXIF / XMP"],
  [0xe2, "APP2 · ICC profile"],
  [0xe3, "APP3 · Metadata"],
  [0xed, "APP13 · IPTC / Photoshop"],
  [0xeb, "APP11 · JUMBF / C2PA"],
  [0xee, "APP14 · Adobe"],
  [0xfe, "Comment"],
]);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function detectImageFormat(bytes: Uint8Array, mimeType = ""): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "JPEG";
  if (bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG") return "PNG";
  if (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "WebP";
  }
  if (String.fromCharCode(...bytes.slice(0, 3)) === "GIF") return "GIF";
  if (String.fromCharCode(...bytes.slice(4, 12)) === "ftypavif") return "AVIF";
  if (mimeType.startsWith("image/")) return mimeType.slice(6).toUpperCase();
  return "Unknown";
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function hasTrailingJpegEoi(bytes: Uint8Array, fromOffset: number): boolean {
  for (let index = bytes.length - 2; index >= fromOffset; index -= 1) {
    if (bytes[index] === 0xff && bytes[index + 1] === 0xd9) {
      return true;
    }
  }
  return false;
}

export function extractImageStructure(
  bytes: Uint8Array,
  format: string,
): Array<{ name: string; size: number }> {
  const chunks: Array<{ name: string; size: number }> = [];

  if (format === "JPEG" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    chunks.push({ name: "SOI · Start of image", size: 2 });
    let offset = 2;
    let foundEoi = false;

    while (offset + 1 < bytes.length) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      if (marker === undefined) break;
      if (marker === 0xd9) {
        foundEoi = true;
        break;
      }
      offset += 1;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;

      const segmentLength = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
      if (segmentLength < 2 || offset + segmentLength > bytes.length) break;

      const name = jpegMarkers.get(marker);
      if (name) chunks.push({ name, size: segmentLength - 2 });

      if (marker === 0xda) {
        const scanStart = offset + segmentLength;
        foundEoi = hasTrailingJpegEoi(bytes, scanStart);
        const scanSize = Math.max(0, bytes.length - scanStart - (foundEoi ? 2 : 0));
        chunks.push({ name: "Image scan data", size: scanSize });
        break;
      }
      offset += segmentLength;
    }

    if (foundEoi) {
      chunks.push({ name: "EOI · End of image", size: 2 });
    }
  } else if (format === "PNG" && bytes.length >= 8) {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = readUint32BE(bytes, offset);
      const name = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (offset + 12 + length > bytes.length) break;
      const labelSuffix =
        name === "eXIf"
          ? " · EXIF"
          : name === "iCCP"
            ? " · ICC profile"
            : name === "iTXt" || name === "tEXt" || name === "zTXt"
              ? " · Text metadata"
              : "";
      chunks.push({ name: `${name}${labelSuffix}`, size: length });
      offset += length + 12;
      if (name === "IEND") break;
    }
  } else if (format === "WebP" && bytes.length >= 12) {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const name = String.fromCharCode(...bytes.slice(offset, offset + 4));
      const length = readUint32LE(bytes, offset + 4);
      if (offset + 8 + length > bytes.length) break;
      const labelSuffix =
        name === "EXIF"
          ? " · EXIF"
          : name === "XMP "
            ? " · XMP"
            : name === "ICCP"
              ? " · ICC profile"
              : "";
      chunks.push({ name: `${name}${labelSuffix}`, size: length });
      offset += length + (length % 2) + 8;
    }
  }

  return chunks;
}

function displayValue(value: unknown): string {
  if (value instanceof Uint8Array) return `${value.byteLength} bytes`;
  if (value instanceof ArrayBuffer) return `${value.byteLength} bytes`;
  if (Array.isArray(value)) return value.map(displayValue).join(", ");
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${displayValue(item)}`)
      .join(" · ");
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(Number(value.toFixed(5)));
  return String(value);
}

function exifEntries(metadata: Record<string, unknown> | null) {
  return Object.entries(metadata ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => ({ label, value: displayValue(value) }));
}

function makeSections(
  metadata: Record<string, unknown> | null,
  structure: Array<{ name: string; size: number }>,
  hash: string,
  ocrText: string,
) {
  const entries = exifEntries(metadata);
  const has = (pattern: RegExp) => entries.filter(({ label }) => pattern.test(label));
  return [
    {
      title: "Basic metadata",
      note: "File and image properties",
      values: [] as Array<{ label: string; value: string }>,
    },
    {
      title: "EXIF & camera",
      note: "Camera, lens and exposure information",
      values: has(
        /make|model|lens|aperture|fnumber|iso|exposure|shutter|focal|artist|software|firmware|orientation|white.?balance|flash|metering/i,
      ),
    },
    {
      title: "Dates & times",
      note: "Date values found inside the image",
      values: has(/date|time|subsec/i),
    },
    {
      title: "GPS location",
      note: "Coordinates and GPS details, if recorded",
      values: has(/gps|latitude|longitude|altitude|direction|timestamp/i),
    },
    {
      title: "Device & editing",
      note: "Device, software and export tags, if retained",
      values: has(
        /software|firmware|hostcomputer|processing|creator|artist|history|derived|document.?id|instance.?id/i,
      ),
    },
    {
      title: "Image fingerprints",
      note: "SHA-256 is exact; the visual hash is an approximate comparison aid",
      values: [
        { label: "SHA-256", value: hash },
        { label: "Visual difference hash", value: "Calculating…" },
      ],
    },
    {
      title: "Signatures & provenance",
      note: "Presence checks only; embedded credentials are not cryptographically verified",
      values: has(/signature|certificate|credential|c2pa|jumbf|manifest|provenance/i),
    },
    {
      title: "Editing history",
      note: "Only history still embedded in the file can be shown",
      values: has(/history|software|creator|modify|export|derived|document.?id/i),
    },
    {
      title: "Embedded thumbnail",
      note: "Preview extracted from the original file, if available",
      values: [] as Array<{ label: string; value: string }>,
    },
    {
      title: "Color profile",
      note: "Color-space tags and embedded profile indicators",
      values: has(/color.?space|icc|profile|gamma|chromaticity|white.?point/i),
    },
    {
      title: "Image forensics",
      note: "File facts only; compression/noise checks are not proof of editing",
      values: [
        {
          label: "Assessment",
          value: "No automated manipulation verdict is made from metadata alone.",
        },
      ],
    },
    {
      title: "AI & C2PA indicators",
      note: "Searches embedded tags; absence does not prove an image is human-made",
      values: has(/c2pa|jumbf|ai.?generated|trainedalgorithmicmedia|digital.?source|manifest/i),
    },
    {
      title: "File structure",
      note: "Recognized containers and metadata-bearing segments",
      values: structure.map((segment, index) => ({
        label: `Part ${index + 1} · ${segment.name}`,
        value: formatBytes(segment.size),
      })),
    },
    {
      title: "Visible content",
      note: "OCR runs locally only when the browser offers built-in text recognition; objects/places are not identified",
      values: ocrText
        ? [{ label: "Recognized text", value: ocrText }]
        : [
            {
              label: "OCR",
              value: "No text recognized, or built-in browser OCR is not available.",
            },
            { label: "Objects & landmarks", value: "Not analyzed." },
          ],
    },
    {
      title: "Biometric information",
      note: "Biometric identification and fingerprint/signature-pattern analysis are not performed",
      values: [
        { label: "Privacy", value: "Faces and biometric traits are not identified or extracted." },
      ],
    },
  ];
}

function hsvString(r: number, g: number, b: number): string {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const saturation = max === 0 ? 0 : (delta / max) * 100;
  return `${Math.round(hue)}°, ${Math.round(saturation)}%, ${Math.round(max * 100)}%`;
}

export function summarizeRgbaPixels(pixels: Uint8ClampedArray) {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  let opaquePixelsCount = 0;
  const bins = new Map<string, { red: number; green: number; blue: number; count: number }>();
  const histogram = Array.from({ length: 8 }, () => 0);

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] ?? 0;
    const green = pixels[index + 1] ?? 0;
    const blue = pixels[index + 2] ?? 0;
    const alpha = pixels[index + 3] ?? 0;
    if (alpha === 0) continue;

    opaquePixelsCount += 1;
    redTotal += red;
    greenTotal += green;
    blueTotal += blue;

    const key = `${Math.round(red / 32)},${Math.round(green / 32)},${Math.round(blue / 32)}`;
    const bucket = bins.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    bucket.count += 1;
    bins.set(key, bucket);

    const luminance = Math.floor((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 32);
    const binIndex = Math.min(7, Math.max(0, luminance));
    histogram[binIndex] = (histogram[binIndex] ?? 0) + 1;
  }

  if (opaquePixelsCount === 0) {
    return {
      averageRgb: "Transparent",
      palette: [] as ImagePaletteColor[],
      histogram: histogram.map((value) => `${value}`),
    };
  }

  const averageRed = Math.round(redTotal / opaquePixelsCount);
  const averageGreen = Math.round(greenTotal / opaquePixelsCount);
  const averageBlue = Math.round(blueTotal / opaquePixelsCount);

  const palette: ImagePaletteColor[] = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((color) => {
      const r = Math.round(color.red / color.count);
      const g = Math.round(color.green / color.count);
      const b = Math.round(color.blue / color.count);
      return {
        hex: `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`,
        rgb: `${r}, ${g}, ${b}`,
        hsv: hsvString(r, g, b),
        share: Math.round((color.count / opaquePixelsCount) * 100),
      };
    });

  return {
    averageRgb: `${averageRed}, ${averageGreen}, ${averageBlue}`,
    palette,
    histogram: histogram.map((value) => `${value}`),
  };
}

function analyzePixels(image: ImageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read image pixels.");
  context.drawImage(image, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data;
  const colorSummary = summarizeRgbaPixels(pixels);

  let differenceHash = "";
  const hashCanvas = document.createElement("canvas");
  hashCanvas.width = 9;
  hashCanvas.height = 8;
  const hashContext = hashCanvas.getContext("2d", { willReadFrequently: true });
  if (hashContext) {
    hashContext.drawImage(image, 0, 0, 9, 8);
    const data = hashContext.getImageData(0, 0, 9, 8).data;
    let bits = "";
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const left = (y * 9 + x) * 4;
        const right = left + 4;
        const leftGray =
          0.299 * (data[left] ?? 0) + 0.587 * (data[left + 1] ?? 0) + 0.114 * (data[left + 2] ?? 0);
        const rightGray =
          0.299 * (data[right] ?? 0) +
          0.587 * (data[right + 1] ?? 0) +
          0.114 * (data[right + 2] ?? 0);
        bits += leftGray > rightGray ? "1" : "0";
      }
    }
    differenceHash =
      bits
        .match(/.{1,4}/g)
        ?.map((group) => parseInt(group, 2).toString(16))
        .join("") ?? "";
  }

  return {
    ...colorSummary,
    differenceHash: differenceHash || "Unavailable",
  };
}

function metadataDateValue(metadata: Record<string, unknown> | null, keys: string[]) {
  const entry = Object.entries(metadata ?? {}).find(
    ([key, value]) => keys.includes(key) && value !== undefined && value !== null,
  );
  return entry ? displayValue(entry[1]) : "Not recorded";
}

async function readBlobBytes(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof file.arrayBuffer === "function") {
    return new Uint8Array(await file.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Could not read image bytes."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image bytes."));
    reader.readAsArrayBuffer(file);
  });
}

export async function analyzeImage(
  file: Blob,
  filename: string,
  modifiedAt?: number,
): Promise<ImageAuditReport> {
  const bytes = await readBlobBytes(file);
  const format = detectImageFormat(bytes, file.type);
  const { default: exifr } = await import("exifr");
  let metadata: Record<string, unknown> | null = null;
  let metadataError = false;
  try {
    metadata = (await exifr.parse(bytes, {
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: true,
      ihdr: true,
      jfif: true,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      sanitize: true,
    })) as Record<string, unknown> | null;
  } catch {
    metadataError = true;
  }

  const structure = extractImageStructure(bytes, format);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  const modifiedDate = modifiedAt
    ? new Date(modifiedAt).toLocaleString()
    : "Remote file · date not supplied";
  const dateCaptured = metadataDateValue(metadata, [
    "DateTimeOriginal",
    "CreateDate",
    "Date Created",
    "DateTimeDigitized",
  ]);
  const metadataWidth = Number(
    metadata?.["ImageWidth"] ?? metadata?.["ExifImageWidth"] ?? metadata?.["width"] ?? 0,
  );
  const metadataHeight = Number(
    metadata?.["ImageHeight"] ?? metadata?.["ExifImageHeight"] ?? metadata?.["height"] ?? 0,
  );

  let bitmap: ImageBitmap | null = null;
  let decodedWidth = 0;
  let decodedHeight = 0;
  let colors = {
    averageRgb: "Unavailable",
    palette: [] as ImagePaletteColor[],
    histogram: [] as string[],
    differenceHash: "Unavailable",
  };

  try {
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(file);
      decodedWidth = bitmap.width;
      decodedHeight = bitmap.height;
      colors = analyzePixels(bitmap);
    }
  } catch {
    // Metadata and file information remain available for browser-unsupported formats.
  }

  let thumbnail: string | null = null;
  try {
    const thumb = await exifr.thumbnail(bytes);
    if (thumb) {
      const thumbnailBlob = new Blob([new Uint8Array(thumb)], { type: "image/jpeg" });
      thumbnail = URL.createObjectURL(thumbnailBlob);
    }
  } catch {
    // Embedded previews are optional and may not exist in the source image.
  }

  let ocrText = "";
  let ocrAvailable = false;
  if (bitmap && typeof window !== "undefined") {
    type TextRecognizer = {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
    };
    type RecognizerWindow = Window & { TextDetector?: new () => TextRecognizer };
    const TextDetector = (window as RecognizerWindow).TextDetector;
    if (TextDetector) {
      ocrAvailable = true;
      try {
        const detections = await new TextDetector().detect(bitmap);
        ocrText = detections
          .map((item) => item.rawValue)
          .filter(Boolean)
          .join(" · ");
      } catch {
        ocrText = "Recognition is not available for this image.";
      }
    }
  }
  bitmap?.close();

  const finalWidth = decodedWidth > 0 ? decodedWidth : metadataWidth;
  const finalHeight = decodedHeight > 0 ? decodedHeight : metadataHeight;
  const hasDimensions = finalWidth > 0 && finalHeight > 0;

  const sections = makeSections(metadata, structure, hash, ocrText);
  const basic = sections.find((section) => section.title === "Basic metadata");
  if (basic) {
    basic.values.push(
      { label: "Filename", value: filename },
      { label: "Format", value: format },
      { label: "File size", value: formatBytes(file.size) },
      {
        label: "Dimensions",
        value: hasDimensions ? `${finalWidth} × ${finalHeight} px` : "Unavailable",
      },
      {
        label: "Resolution",
        value: `${hasDimensions ? `${finalWidth} × ${finalHeight} pixels` : "Not recorded"} · DPI not assumed`,
      },
      { label: "Image profile", value: file.type || "Not declared" },
      { label: "Date modified", value: modifiedDate },
      { label: "EXIF capture date", value: dateCaptured },
      {
        label: "Container parse",
        value: metadataError
          ? "Some embedded tags could not be read"
          : "Complete for supported embedded tags",
      },
    );
  }
  const fingerprint = sections.find((section) => section.title === "Image fingerprints");
  if (fingerprint?.values[1]) fingerprint.values[1].value = colors.differenceHash;
  const signature = sections.find((section) => section.title === "Signatures & provenance");
  if (signature && signature.values.length === 0) {
    signature.values.push({
      label: "C2PA / signatures",
      value: "No recognized signature tags found · embedded certificates are not verified",
    });
  }
  const profile = sections.find((section) => section.title === "Color profile");
  if (profile && profile.values.length === 0) {
    profile.values.push({ label: "Embedded profile", value: "No profile tag was found" });
  }
  const history = sections.find((section) => section.title === "Editing history");
  if (history && history.values.length === 0) {
    history.values.push({ label: "History", value: "No retained editing-history tags found" });
  }
  const ai = sections.find((section) => section.title === "AI & C2PA indicators");
  if (ai && ai.values.length === 0) {
    ai.values.push({
      label: "Embedded indicators",
      value: "No recognized AI/C2PA tags found · this cannot determine how an image was made",
    });
  }
  const visible = sections.find((section) => section.title === "Visible content");
  if (visible && !ocrAvailable) {
    visible.values[0] = {
      label: "OCR",
      value: "Built-in browser OCR is not available; no text scan was run.",
    };
  }
  const thumbnailSection = sections.find((section) => section.title === "Embedded thumbnail");
  if (thumbnailSection) {
    thumbnailSection.values.push({
      label: "Preview",
      value: thumbnail ? "Embedded preview found" : "No embedded thumbnail found",
    });
  }

  return {
    filename,
    format,
    mimeType: file.type || "Unknown",
    fileSize: formatBytes(file.size),
    modifiedDate,
    dimensions: hasDimensions ? `${finalWidth} × ${finalHeight} px` : "Unavailable",
    megapixels: hasDimensions
      ? `${((finalWidth * finalHeight) / 1_000_000).toFixed(2)} MP`
      : "Unavailable",
    resolution: hasDimensions ? `${finalWidth} × ${finalHeight} px` : "Unavailable",
    cryptographicHash: hash,
    perceptualHash: colors.differenceHash,
    sections,
    colors: {
      averageRgb: colors.averageRgb,
      palette: colors.palette,
      histogram: colors.histogram,
    },
    thumbnail,
    thumbnailType: "image/jpeg",
    clearCopyNote:
      "A new full-size image copy is re-encoded locally. Embedded metadata is discarded; visible pixels are not changed intentionally.",
  };
}

export async function createMetadataFreeCopy(file: Blob, mimeType: string): Promise<Blob> {
  const image = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    image.close();
    throw new Error("This browser cannot create a clean image copy.");
  }
  context.drawImage(image, 0, 0);
  image.close();
  const supportedType = ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ? mimeType
    : "image/png";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The clean image copy could not be created."));
      },
      supportedType,
      supportedType === "image/jpeg" ? 0.96 : 1,
    );
  });
}

export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function metadataFreeFilename(filename: string, mimeType: string): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "image";
  return `${stem}-clean.${extension}`;
}
