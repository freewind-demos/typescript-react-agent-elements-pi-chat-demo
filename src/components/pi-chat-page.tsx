// 整个 demo 对外只有这一个组件：设置、主题、对话都在这一个页面里
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { AgentChat } from "@/components/agent-elements/agent-chat";
import { InputBar } from "@/components/agent-elements/input-bar";
import { ModelPicker } from "@/components/agent-elements/input/model-picker";
import { ModeSelector } from "@/components/agent-elements/input/mode-selector";
import { usePiChat, type Attachment } from "@/hooks/use-pi-chat";
import { toAttachment } from "@/lib/image";

// 10 套皮肤的名字，值在 src/styles/themes.css 里
const THEMES = [
  "neutral",
  "zinc",
  "slate",
  "stone",
  "gray",
  "red",
  "rose",
  "orange",
  "green",
  "blue",
] as const;

type ThemeName = (typeof THEMES)[number];

export function PiChatPage() {
  const { messages, status, settings, error, send, stop, updateSettings } =
    usePiChat();

  // 待发送的图片
  const [images, setImages] = useState<Attachment[]>([]);
  // 当前皮肤，默认 neutral
  const [theme, setTheme] = useState<ThemeName>(() => {
    const saved = localStorage.getItem("pi-chat-theme") as ThemeName | null;
    return saved && THEMES.includes(saved) ? saved : "neutral";
  });

  // 首帧把皮肤写到 html 上，CSS 变量才会生效
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // 隐藏的文件选择框，点回形针时触发
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 记下最新状态，供稳定的输入框槽位读取
  const ctx = useRef({ settings, theme, updateSettings });
  ctx.current = { settings, theme, updateSettings };

  // 切皮肤：只改 html 上的 data-theme，样式全在 CSS 变量里
  const changeTheme = useCallback((next: ThemeName) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("pi-chat-theme", next);
  }, []);

  // 选中图片后转 base64 存起来
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const next = await Promise.all(Array.from(files).map(toAttachment));
    setImages((prev) => [...prev, ...next]);
  }, []);

  // 粘贴图片：直接读剪贴板里的文件
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) return;
      event.preventDefault();
      void handleFiles(files as unknown as FileList);
    },
    [handleFiles],
  );

  // 发消息：文本与图片一起交给后台，然后清空待发送图片
  const handleSend = useCallback(
    ({ content }: { role: "user"; content: string }) => {
      const text = content.trim();
      if (!text && images.length === 0) return;
      void send(text, images);
      setImages([]);
    },
    [images, send],
  );

  // InputBar 的槽位：左侧放模型与 thinking，右侧放皮肤
  const InputBarSlot = useMemo(() => {
    return function Slot(props: any) {
      const current = ctx.current;
      const modelOptions = (current.settings?.models ?? []).map((model) => ({
        // id 就是 provider/modelId，切模型时原样回传
        id: model.id,
        name: model.name,
        version: model.provider,
      }));
      const thinkingModes = (current.settings?.thinkingLevels ?? []).map(
        (level) => ({ id: level, label: level }),
      );
      const themeModes = THEMES.map((name) => ({ id: name, label: name }));

      return (
        <InputBar
          {...props}
          leftActions={
            <>
              {/* 模型下拉：自带搜索，列表按 provider 显示在右侧 */}
              <ModelPicker
                models={modelOptions}
                value={current.settings?.currentModelId ?? undefined}
                onChange={(modelId) => void current.updateSettings({ modelId })}
              />
              {/* thinking 等级，取值来自 pi 对当前模型的回答 */}
              <ModeSelector
                modes={thinkingModes}
                value={current.settings?.thinkingLevel}
                onChange={(level) =>
                  void current.updateSettings({ thinkingLevel: level })
                }
              />
            </>
          }
          rightActions={
            // 皮肤切换复用同一个下拉
            <ModeSelector
              modes={themeModes}
              value={current.theme}
              onChange={(next) => changeTheme(next as ThemeName)}
            />
          }
        />
      );
    };
  }, [changeTheme]);

  return (
    <>
      {/* 隐藏的文件输入，不属于界面的一部分 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <AgentChat
        messages={messages as UIMessage[]}
        status={status}
        error={error ?? undefined}
        onSend={handleSend}
        onStop={() => void stop()}
        emptyStatePosition="center"
        slots={{ InputBar: InputBarSlot }}
        attachments={{
          // 点回形针时打开系统文件选择框
          onAttach: () => fileInputRef.current?.click(),
          images: images.map((image) => ({
            id: image.id,
            filename: image.filename,
            url: image.url,
            size: image.size,
          })),
          files: [],
          onRemoveImage: (id) =>
            setImages((prev) => prev.filter((image) => image.id !== id)),
          onRemoveFile: () => {},
          onPaste: handlePaste,
          isDragOver: false,
        }}
      />
    </>
  );
}
