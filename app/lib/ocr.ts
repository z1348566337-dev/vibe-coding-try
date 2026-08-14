export type OcrProgress = {
  status: string;
  progress: number;
};

const OCR_STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "正在加载识别引擎",
  "initializing tesseract": "正在启动识别引擎",
  "loading language traineddata": "正在加载中英文模型",
  "initializing api": "正在准备文字识别",
  "recognizing text": "正在识别图片文字",
};

export function getOcrStatusLabel(status: string) {
  return OCR_STATUS_LABELS[status] ?? "正在准备本机识别";
}

export function normalizeOcrText(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function recognizeImageText(
  image: string,
  onProgress?: (progress: OcrProgress) => void,
) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["chi_sim", "eng"], undefined, {
    logger: (message) => {
      onProgress?.({
        status: getOcrStatusLabel(message.status),
        progress: Number.isFinite(message.progress) ? message.progress : 0,
      });
    },
  });

  try {
    const result = await worker.recognize(image);
    return normalizeOcrText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
