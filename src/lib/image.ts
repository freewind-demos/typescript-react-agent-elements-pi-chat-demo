// 把用户选中的图片转成 base64：url 给预览，data 直接发给 pi
import type { Attachment } from "../hooks/use-pi-chat";

export async function toAttachment(file: File): Promise<Attachment> {
  // 只接受图片，其它类型直接拒绝
  if (!file.type.startsWith("image/")) {
    throw new Error("只支持图片文件");
  }
  // 单张限制 5MB，避免 base64 撑爆请求体
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("图片不能超过 5MB");
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    // 读成 data:image/png;base64,xxx 形式
    reader.readAsDataURL(file);
  });

  return {
    id: crypto.randomUUID(),
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    url: dataUrl,
    // 逗号后面就是纯 base64
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
  };
}
