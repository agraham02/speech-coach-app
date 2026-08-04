import { useState } from "react";
import { Pause, Play, RotateCcw, Settings, X } from "lucide-react";
import { PhoneFrame } from "@/components/PhoneFrame";
import { Teleprompter } from "@/components/Teleprompter";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { SAMPLE_SCRIPT } from "@/data/sampleScript";

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playToken, setPlayToken] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [cuesEnabled, setCuesEnabled] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [lineHeight, setLineHeight] = useState(34);
  const [fontSize, setFontSize] = useState(19);
  const [panelFraction, setPanelFraction] = useState(1 / 3);
  const [solidFraction, setSolidFraction] = useState(0.8);

  const target = SAMPLE_SCRIPT.targetDurationSeconds;
  const remaining = Math.max(0, target - elapsed);
  const done = elapsed >= target - 0.05;

  function toggleRecord() {
    if (done) {
      setSeekTo(0);
      setElapsed(0);
      setIsPlaying(true);
      setPlayToken((t) => t + 1);
      return;
    }
    setIsPlaying((p) => {
      const next = !p;
      if (next) setPlayToken((t) => t + 1);
      return next;
    });
  }

  function restart() {
    setIsPlaying(false);
    setSeekTo(0);
    setElapsed(0);
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center gap-8 bg-neutral-950 p-10 text-white lg:flex-row lg:items-start lg:justify-center">
      <PhoneFrame>
        {/* Base layer: the overlay + text span the ENTIRE screen, including
            behind the top bar and bottom controls — those float on top of it
            rather than pushing it into a constrained middle strip. */}
        <div className="absolute inset-0">
          <Teleprompter
            script={SAMPLE_SCRIPT}
            cuesEnabled={cuesEnabled}
            lineHeight={lineHeight}
            fontSize={fontSize}
            panelFraction={panelFraction}
            solidFraction={solidFraction}
            playToken={playToken}
            playbackRate={playbackRate}
            isPlaying={isPlaying}
            seekTo={seekTo}
            onProgress={(e) => {
              setElapsed(e);
              if (seekTo != null) setSeekTo(null);
            }}
            onDone={() => setIsPlaying(false)}
          />
        </div>

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 pt-4">
          <button className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white">
            <X size={20} />
          </button>
          <button className="grid h-10 w-10 place-items-center rounded-full bg-black/40 text-white/80">
            <Settings size={18} />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 pb-9">
          <button
            onClick={toggleRecord}
            className="grid h-[72px] w-[72px] place-items-center rounded-full border-4 border-white"
          >
            <span
              className={`bg-red-500 transition-all ${isPlaying ? "h-6 w-6 rounded-md" : "h-[54px] w-[54px] rounded-full"}`}
            />
          </button>
          <span className="text-xs font-semibold text-white/70">
            {done
              ? "Tap to restart"
              : isPlaying
                ? `${formatDuration(remaining)} left · tap to stop`
                : elapsed > 0
                  ? "Paused · tap to resume"
                  : "Tap to start"}
          </span>
        </div>
      </PhoneFrame>

      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
        <div>
          <h1 className="text-lg font-semibold">Teleprompter prototype</h1>
          <p className="mt-1 text-sm text-white/50">
            Tune the reading band live, then we port the settled design back into the RN app.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button size="icon" variant="secondary" onClick={toggleRecord}>
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Button size="icon" variant="ghost" onClick={restart}>
            <RotateCcw size={16} />
          </Button>
          <div className="flex-1 text-sm text-white/60">
            {formatDuration(elapsed)} / {formatDuration(target)}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-white/50">Scrub</span>
          <Slider
            value={[elapsed]}
            min={0}
            max={target}
            step={0.1}
            onValueChange={([v]) => {
              setIsPlaying(false);
              setSeekTo(v);
              setElapsed(v);
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">Show delivery cues</span>
          <Switch checked={cuesEnabled} onCheckedChange={setCuesEnabled} />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm">Playback speed</span>
          <div className="flex gap-1">
            {[0.5, 1, 2, 4].map((rate) => (
              <button
                key={rate}
                onClick={() => setPlaybackRate(rate)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  playbackRate === rate ? "bg-indigo-500 text-white" : "bg-white/10 text-white/60"
                }`}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t border-white/10 pt-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-white/50">
              <span>Line height</span>
              <span>{lineHeight}px</span>
            </div>
            <Slider value={[lineHeight]} min={26} max={44} step={1} onValueChange={([v]) => setLineHeight(v)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-white/50">
              <span>Font size</span>
              <span>{fontSize}px</span>
            </div>
            <Slider value={[fontSize]} min={14} max={26} step={1} onValueChange={([v]) => setFontSize(v)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-white/50">
              <span>Panel size</span>
              <span>{Math.round(panelFraction * 100)}%</span>
            </div>
            <Slider
              value={[panelFraction]}
              min={0.2}
              max={0.45}
              step={0.01}
              onValueChange={([v]) => setPanelFraction(v)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-white/50">
              <span>Solid vs. transition</span>
              <span>
                {Math.round(solidFraction * 100)}:{Math.round((1 - solidFraction) * 100)}
              </span>
            </div>
            <Slider
              value={[solidFraction]}
              min={0.4}
              max={0.95}
              step={0.01}
              onValueChange={([v]) => setSolidFraction(v)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
