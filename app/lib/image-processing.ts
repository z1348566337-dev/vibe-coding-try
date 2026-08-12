export const MAX_IMAGE_DIMENSION = 1600;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export type ImageTransform = {
  rotation: 0 | 90 | 180 | 270;
  enhance: boolean;
  cropTop: number;
  cropRight: number;
  cropBottom: number;
  cropLeft: number;
};

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  rotation: 0,
  enhance: false,
  cropTop: 0,
  cropRight: 0,
  cropBottom: 0,
  cropLeft: 0,
};

export function calculateImageSize(width: number, height: number, maxDimension = MAX_IMAGE_DIMENSION) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function calculateCropRect(
  width: number,
  height: number,
  transform: Pick<ImageTransform, "cropTop" | "cropRight" | "cropBottom" | "cropLeft">,
) {
  const clamp = (value: number) => Math.max(0, Math.min(35, value));
  const left = Math.round((width * clamp(transform.cropLeft)) / 100);
  const top = Math.round((height * clamp(transform.cropTop)) / 100);
  const right = Math.round((width * clamp(transform.cropRight)) / 100);
  const bottom = Math.round((height * clamp(transform.cropBottom)) / 100);
  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取这张图片。"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法解析这张图片，请换一张重试。"));
    image.src = source;
  });
}

function applyEnhancement(context: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = data[index + channel] / 255;
      const contrasted = (normalized - 0.5) * 1.24 + 0.5;
      data[index + channel] = Math.max(0, Math.min(255, Math.round((contrasted * 1.05 + 0.025) * 255)));
    }
  }
  context.putImageData(imageData, 0, 0);
}

async function renderProcessedImage(source: string, transform: ImageTransform) {
  const image = await loadImage(source);
  const crop = calculateCropRect(image.naturalWidth, image.naturalHeight, transform);
  const sized = calculateImageSize(crop.width, crop.height);
  const rotated = transform.rotation === 90 || transform.rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = rotated ? sized.height : sized.width;
  canvas.height = rotated ? sized.width : sized.height;
  const context = canvas.getContext("2d", { willReadFrequently: transform.enhance });
  if (!context) throw new Error("当前浏览器无法处理图片。");
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    -sized.width / 2,
    -sized.height / 2,
    sized.width,
    sized.height,
  );
  context.restore();
  if (transform.enhance) applyEnhancement(context, canvas.width, canvas.height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return canvas.toDataURL("image/jpeg", quality);
}

function approximateDataUrlBytes(dataUrl: string) {
  const payload = dataUrl.split(",")[1] ?? "";
  return Math.ceil((payload.length * 3) / 4);
}

export async function processImageFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  const source = await readFileAsDataUrl(file);
  return processImageDataUrl(source, DEFAULT_IMAGE_TRANSFORM);
}

export async function processImageDataUrl(source: string, transform: ImageTransform) {
  const canvas = await renderProcessedImage(source, transform);
  let quality = 0.84;
  let dataUrl = canvasToJpeg(canvas, quality);
  while (approximateDataUrlBytes(dataUrl) > MAX_IMAGE_BYTES && quality > 0.5) {
    quality -= 0.08;
    dataUrl = canvasToJpeg(canvas, quality);
  }
  return { dataUrl, mimeType: "image/jpeg", width: canvas.width, height: canvas.height };
}
