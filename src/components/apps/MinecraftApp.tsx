import React, { useState, useRef } from 'react';
import { RefreshCw, ExternalLink, Maximize2, Globe } from 'lucide-react';

const MINECRAFT_CLIENT_URL = 'https://moozunobu.github.io/my-minecraft-web-client/';

export const MinecraftApp: React.FC = () => {
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handleOpenExternal = () => {
    window.open(MINECRAFT_CLIENT_URL, '_blank', 'noopener,noreferrer');
  };

  const handleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      } else {
        containerRef.current.requestFullscreen?.().catch(() => {});
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col bg-zinc-950 text-zinc-100 select-none overflow-hidden relative"
      onKeyDown={(e) => {
        // Prevent key events inside Minecraft from bubbling to OS shortcuts
        e.stopPropagation();
      }}
    >
      {/* Top Utility Bar */}
      <div className="h-8 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between text-xs shrink-0 select-none z-10">
        <div className="flex items-center gap-2 text-zinc-400">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[280px] sm:max-w-md">
            {MINECRAFT_CLIENT_URL}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleReload}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="再読み込み (Reload)"
            id="minecraft-reload-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="フルスクリーン (Fullscreen)"
            id="minecraft-fullscreen-btn"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="新しいタブで開く (Open in New Tab)"
            id="minecraft-open-new-tab-btn"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 top-8 bg-zinc-950/90 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-xs text-zinc-400 font-mono">Loading Minecraft Web Client...</div>
        </div>
      )}

      {/* Embedded Web Client iframe */}
      <div className="flex-1 w-full h-full relative bg-black">
        <iframe
          key={iframeKey}
          src={MINECRAFT_CLIENT_URL}
          title="Minecraft Web Client"
          className="w-full h-full border-none"
          allow="fullscreen; autoplay; camera; microphone; clipboard-read; clipboard-write; pointer-lock"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads allow-modals"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  );
};
