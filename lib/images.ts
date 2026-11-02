// Fotoğraf yükleme yardımcıları.
// Amaç: telefonlardaki büyük fotoğrafları yüklemeden önce küçültmek,
// HTTPS olmayan ortamlarda da çalışmak ve hata mesajlarını anlaşılır göstermek.

export const MAX_FINAL_BYTES = 5 * 1024 * 1024; // Sunucuya gidecek dosya sınırı (küçültmeden sonra)
export const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024; // Telefondan seçilebilecek en büyük ham dosya
const MAX_SIDE = 2400; // Uzun kenar piksel sınırı
const COMPRESS_ABOVE = 1.5 * 1024 * 1024; // Bundan büyük dosyalar küçültülür

const EXT_TO_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
const TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const ALLOWED_TYPES = Object.keys(TYPE_TO_EXT);

// crypto.randomUUID sadece HTTPS/localhost'ta vardır. Telefondan http://192.168.x.x ile
// açıldığında "undefined" olur ve yükleme başlamadan çöker. Bu yüzden yedek yöntem var.
export function makeId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      /* yedek yönteme geç */
    }
  }
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(12);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// Bazı telefon/tarayıcılar (özellikle HEIC'te) file.type değerini boş bırakır.
export function detectType(f: File): string {
  const t = (f.type || "").toLowerCase();
  if (t) return t;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_TYPE[ext] ?? "";
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* <img> yöntemine geç */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function compress(file: File): Promise<Blob | null> {
  const d = await decode(file);
  try {
    if (!d.width || !d.height) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(d.width, d.height));
    const w = Math.max(1, Math.round(d.width * scale));
    const h = Math.max(1, Math.round(d.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff"; // şeffaf PNG'lerde siyah arka plan olmasın
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(d.source, 0, 0, w, h);
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  } finally {
    d.close();
  }
}

export type PreparedImage = { blob: Blob; type: string; ext: string; compressed: boolean };

// Büyük dosyayı küçültür; küçültemezse (ör. Chrome'da HEIC) orijinalini olduğu gibi döndürür.
export async function prepareImage(file: File): Promise<PreparedImage> {
  const type = detectType(file);
  const isHeic = type === "image/heic" || type === "image/heif";
  if (isHeic || file.size > COMPRESS_ABOVE) {
    try {
      const out = await compress(file);
      if (out && (isHeic || out.size < file.size)) {
        return { blob: out, type: "image/jpeg", ext: "jpg", compressed: true };
      }
    } catch (e) {
      console.warn("Fotoğraf küçültülemedi, orijinali yüklenecek:", e);
    }
  }
  return { blob: file, type, ext: TYPE_TO_EXT[type] ?? "jpg", compressed: false };
}

// Supabase'in İngilizce hata mesajlarını anlaşılır Türkçe açıklamaya çevirir.
export function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (/maximum allowed size|too large|payload/.test(m)) return "dosya, Supabase bucket boyut sınırını aşıyor";
  if (/row-level security|violates|policy|not authorized|unauthorized/.test(m)) return "Supabase izin (policy) ayarı eksik";
  if (/mime|not supported|invalid.*type/.test(m)) return "bu dosya türüne bucket'ta izin verilmemiş";
  if (/bucket not found|not found/.test(m)) return "engagement-photos bucket'ı bulunamadı";
  if (/failed to fetch|network|load failed|timeout/.test(m)) return "internet bağlantısı sorunu";
  return raw;
}
