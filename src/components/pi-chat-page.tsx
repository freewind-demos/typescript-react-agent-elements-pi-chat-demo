// 整个 demo 对外只有这一个组件：对话、设置、换肤都在这一个页面里
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { IconChevronDown } from "@tabler/icons-react";
import { AgentChat } from "@/components/agent-elements/agent-chat";
import { InputBar } from "@/components/agent-elements/input-bar";
import { usePiChat, type Attachment } from "@/hooks/use-pi-chat";
import { toAttachment } from "@/lib/image";
import {
  SettingsSidebar,
  type SidebarSection,
} from "@/components/pi-chat/settings-sidebar";

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

// 工具栏上的小按钮：样式与库里的下拉触发器完全一致，只是改成开侧栏
function ToolbarTrigger({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-[6px] px-2 text-[12px] leading-4 text-foreground/40 transition-colors hover:bg-foreground/6"
    >
      <span className="font-medium">{label}</span>
      <IconChevronDown className="size-3 text-foreground/40" />
    </button>
  );
}

export function PiChatPage() {
  const { messages, status, settings, error, send, stop, updateSettings } =
    usePiChat();

  // 待发送的图片
  const [images, setImages] = useState<Attachment[]>([]);
  // 右侧设置侧栏当前定位到哪一块；null 表示收起
  const [sidebar, setSidebar] = useState<SidebarSection | null>(null);
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
  const ctx = useRef({ settings, theme, updateSettings, setSidebar });
  ctx.current = { settings, theme, updateSettings, setSidebar };

  // 切皮肤：只改 html 上的 data-theme，样式全在 CSS 变量里
  const changeTheme = useCallback((next: ThemeName) => {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("pi-chat-theme", next);
  }, []);

  // 选中图片后转 base64 存起来
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const next = await Promise.all(Array.from(files).map(toAttachment));
    setImages((prev) => [...prev, ...next]);
  }, []);

  // 粘贴图片：直接读剪贴板里的文件
  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      const files = Array.from(event.clipboardData.files);
      if (files.length === 0) return;
      event.preventDefault();
      void handleFiles(files);
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

  // InputBar 的槽位：左侧是模型与 thinking 入口，右侧是皮肤入口
  const InputBarSlot = useMemo(() => {
    return function Slot(props: any) {
      const current = ctx.current;
      const activeModel = current.settings?.models.find(
        (model) => model.id === current.settings?.currentModelId,
      );

      return (
        <InputBar
          {...props}
          leftActions={
            <>
              <ToolbarTrigger
                label={activeModel?.name ?? "模型"}
                onClick={() => current.setSidebar("model")}
              />
              <ToolbarTrigger
                label={current.settings?.thinkingLevel ?? "thinking"}
                onClick={() => current.setSidebar("thinking")}
              />
            </>
          }
          rightActions={
            <ToolbarTrigger
              label={current.theme}
              onClick={() => current.setSidebar("theme")}
            />
          }
        />
      );
    };
  }, []);

  return (
    <div className="flex h-full">
      {/* 左侧：对话区 */}
      <div className="min-w-0 flex-1">
        {/* 隐藏的文件输入，不属于界面的一部分 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void handleFiles(event.target.files);
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
      </div>

      {/* 右侧：设置侧栏，点一次后常驻，可用右上角关闭 */}
      {sidebar && (
        <SettingsSidebar
          settings={settings}
          theme={theme}
          themes={THEMES}
          activeSection={sidebar}
          onSelectModel={(modelId) => void updateSettings({ modelId })}
          onSelectThinking={(thinkingLevel) =>
            void updateSettings({ thinkingLevel })
          }
          onSelectTheme={(next) => changeTheme(next as ThemeName)}
          onClose={() => setSidebar(null)}
        />
      )}
    </div>
  );
}
