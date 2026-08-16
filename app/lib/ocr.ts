export type OcrProgress = {
  status: string;
  progress: number;
};

export type OcrLanguage = "chi_sim" | "eng";

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
  language: OcrLanguage = "chi_sim",
) {
  onProgress?.({ status: "正在增强图片清晰度", progress: 0.04 });
  const { prepareImageForOcr } = await import("./image-processing");
  const preparedImage = await prepareImageForOcr(image);
  const { createWorker, OEM, PSM } = await import("tesseract.js");
  const worker = await createWorker(language, OEM.LSTM_ONLY, {
    logger: (message) => {
      onProgress?.({
        status: getOcrStatusLabel(message.status),
        progress: Number.isFinite(message.progress)
          ? 0.08 + message.progress * 0.9
          : 0.08,
      });
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const result = await worker.recognize(preparedImage);
    return normalizeOcrText(result.data.text);
  } finally {
    await worker.terminate();
  }
}
