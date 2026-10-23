"use client";

import type { ReactNode } from "react";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { cn } from "../utils/cn";

export type PopoverSide = "top" | "bottom" | "left" | "right";
export type PopoverAlign = "start" | "center" | "end";

export type PopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: PopoverSide;
  align?: PopoverAlign;
  sideOffset?: number;
  className?: string;
};

export function Popover({
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  side = "top",
  align = "start",
  sideOffset = 6,
  className,
}: PopoverProps) {
  return (
    <BasePopover.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <BasePopover.Trigger
        // trigger 内部本来就是一个真 button，外层 span 只做布局，关掉原生 button 语义要求
        nativeButton={false}
        render={(props) => (
          <span {...props} className="inline-flex">
            {trigger}
          </span>
        )}
      />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} align={align} sideOffset={sideOffset}>
          <BasePopover.Popup
            /*
             * 列表最长 80+ 项，不限制高度会直接铺满并超出视口，
             * 超出部分既看不到也点不到，所以这里给一个高度上限并允许滚动。
             * 这是唯一必要的可用性修正，不涉及配色与外观。
             */
            style={{ maxHeight: "min(60vh, 420px)", overflowY: "auto" }}
            /*
             * 弹层是 React Portal，事件仍会沿 React 树冒泡回 InputBar 容器。
             * InputBar 的容器点击会把焦点抢给 textarea，导致点搜索框后没法输入，
             * 所以这里阻断冒泡。
             */
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "min-w-[180px] rounded-[10px] border border-an-border-color bg-an-background p-1 shadow-lg outline-none",
              "text-an-foreground",
              className,
            )}
          >
            {children}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
