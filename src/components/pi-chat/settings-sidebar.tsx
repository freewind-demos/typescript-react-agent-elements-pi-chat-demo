// 右侧设置侧栏：模型 / thinking / 皮肤三块，点击工具栏按钮后展开并保持
import { useMemo, useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import type { Settings } from "../../shared/contract";
import { cn } from "@/components/agent-elements/utils/cn";

// 侧栏里能定位到的三块内容
export type SidebarSection = "model" | "thinking" | "theme";

// 皮肤色点，只用于列表里的小圆点，不参与组件配色
const THEME_DOTS: Record<string, string> = {
  neutral: "#171717",
  zinc: "#52525b",
  slate: "#64748b",
  stone: "#78716c",
  gray: "#6b7280",
  red: "#dc2626",
  rose: "#e11d48",
  orange: "#ea580c",
  green: "#16a34a",
  blue: "#2563eb",
};

type Props = {
  settings: Settings | null;
  theme: string;
  themes: readonly string[];
  activeSection: SidebarSection;
  onSelectModel: (modelId: string) => void;
  onSelectThinking: (level: string) => void;
  onSelectTheme: (theme: string) => void;
  onClose: () => void;
};

export function SettingsSidebar({
  settings,
  theme,
  themes,
  activeSection,
  onSelectModel,
  onSelectThinking,
  onSelectTheme,
  onClose,
}: Props) {
  // 模型搜索关键词：模型可能有 80+ 个
  const [query, setQuery] = useState("");

  const models = useMemo(() => {
    const list = settings?.models ?? [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((model) =>
      `${model.name} ${model.provider} ${model.id}`.toLowerCase().includes(keyword),
    );
  }, [settings, query]);

  // 每块内容的小标题
  const SectionTitle = ({ id, children }: { id: SidebarSection; children: string }) => (
    <div
      className={cn(
        "mb-2 text-[11px] font-medium uppercase tracking-wide",
        activeSection === id ? "text-an-primary-color" : "text-an-foreground-muted",
      )}
    >
      {children}
    </div>
  );

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-an-border-color bg-an-background">
      {/* 头部：标题与关闭 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-an-border-color px-4">
        <span className="text-[13px] font-medium text-an-foreground">设置</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="inline-flex size-6 items-center justify-center rounded-[6px] text-an-foreground-muted transition-colors hover:bg-foreground/6 hover:text-an-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {/* 模型 */}
        <section>
          <SectionTitle id="model">模型</SectionTitle>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模型"
            className="mb-2 h-8 w-full rounded-[6px] border border-an-border-color bg-an-input-background px-2 text-[12px] text-an-foreground outline-none placeholder:text-an-input-placeholder-color focus:border-an-primary-color"
          />
          <div className="max-h-[46vh] overflow-y-auto rounded-[8px] border border-an-border-color">
            {models.map((model) => {
              const active = model.id === settings?.currentModelId;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onSelectModel(model.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] leading-4 text-an-foreground transition-colors hover:bg-foreground/6",
                    active && "bg-foreground/6",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {model.name}
                    <span className="ml-1 text-an-foreground-muted">
                      {model.provider}
                    </span>
                  </span>
                  {active && (
                    <IconCheck className="size-3.5 shrink-0 text-an-foreground/60" />
                  )}
                </button>
              );
            })}
            {models.length === 0 && (
              <div className="px-2.5 py-3 text-[12px] text-an-foreground-muted">
                没有匹配的模型
              </div>
            )}
          </div>
        </section>

        {/* thinking 等级 */}
        <section>
          <SectionTitle id="thinking">Thinking</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {(settings?.thinkingLevels ?? []).map((level) => {
              const active = level === settings?.thinkingLevel;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => onSelectThinking(level)}
                  className={cn(
                    "h-7 rounded-[6px] border px-2.5 text-[12px] leading-4 transition-colors",
                    active
                      ? "border-transparent bg-an-primary-color text-an-send-button-color"
                      : "border-an-border-color text-an-foreground hover:bg-foreground/6",
                  )}
                >
                  {level}
                </button>
              );
            })}
          </div>
        </section>

        {/* 皮肤 */}
        <section>
          <SectionTitle id="theme">皮肤</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {themes.map((name) => {
              const active = name === theme;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelectTheme(name)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2 text-[12px] leading-4 transition-colors",
                    active
                      ? "border-an-primary-color bg-foreground/6 text-an-foreground"
                      : "border-an-border-color text-an-foreground hover:bg-foreground/6",
                  )}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: THEME_DOTS[name] ?? "#a1a1aa" }}
                  />
                  {name}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
