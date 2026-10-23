"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// lottie-react v2 是默认导出；Vite 下这个包可能被包成 { default: Component }，
// 直接当组件用会在运行时拿到对象，报 Element type is invalid，所以先兜一层
import LottieImport from "lottie-react";

const Lottie = ((LottieImport as unknown as { default?: unknown }).default ??
  LottieImport) as any;
import { cn } from "./utils/cn";
import { spiralFastData, spiralSlowData } from "./spiral-loader-data";

const FAST_REPEATS = 4;
const SLOW_REPEATS = 2;

export type SpiralLoaderProps = {
  size?: number;
  className?: string;
};

export function SpiralLoader({ size = 16, className }: SpiralLoaderProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [phase, setPhase] = useState<"fast" | "slow">("fast");
  const repeatCountRef = useRef(0);
  const fastRef = useRef<any>(null);
  const slowRef = useRef<any>(null);
  // 本 demo 只有浅色皮肤，统一反转颜色即可
  const needsInvert = true;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const startFastPhase = useCallback(() => {
    repeatCountRef.current = 0;
    setPhase("fast");
    slowRef.current?.stop();
    fastRef.current?.goToAndPlay(0, true);
  }, []);

  const startSlowPhase = useCallback(() => {
    repeatCountRef.current = 0;
    setPhase("slow");
    fastRef.current?.stop();
    slowRef.current?.goToAndPlay(0, true);
  }, []);

  const handleFastComplete = useCallback(() => {
    repeatCountRef.current += 1;
    if (repeatCountRef.current < FAST_REPEATS) {
      fastRef.current?.goToAndPlay(0, true);
    } else {
      startSlowPhase();
    }
  }, [startSlowPhase]);

  const handleSlowComplete = useCallback(() => {
    repeatCountRef.current += 1;
    if (repeatCountRef.current < SLOW_REPEATS) {
      slowRef.current?.goToAndPlay(0, true);
    } else {
      startFastPhase();
    }
  }, [startFastPhase]);

  if (!isMounted) return null;

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-75",
          needsInvert && "invert",
          phase === "fast" ? "opacity-100" : "opacity-0",
        )}
      >
        <Lottie
          lottieRef={fastRef}
          animationData={spiralFastData}
          loop={false}
          autoplay={true}
          onComplete={handleFastComplete}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-75",
          needsInvert && "invert",
          phase === "slow" ? "opacity-100" : "opacity-0",
        )}
      >
        <Lottie
          lottieRef={slowRef}
          animationData={spiralSlowData}
          loop={false}
          autoplay={false}
          onComplete={handleSlowComplete}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
