import {
  encodePng,
  Raster,
  type Color,
  type PrimaryOutput,
  type RasterData,
  type Vector,
} from "@rexel/core";
import type { PreviewController, PreviewState } from "@rexel/viewmodel";
import { useEffect, useRef, useState } from "react";
import { useObservable } from "../hooks.ts";
import type { UiHost } from "../host.ts";
import { Icon, IconButton } from "./Icon.tsx";

const BYTE_MAX = 255;
const VALUE_DIGITS = 4;
const PNG_EXTENSION = ".png";

function toImageData(raster: RasterData): ImageData {
  const bytes = new Uint8ClampedArray(raster.data.length);
  for (let index = 0; index < raster.data.length; index++) {
    bytes[index] = Math.round((raster.data[index] ?? 0) * BYTE_MAX);
  }
  return new ImageData(bytes, raster.width, raster.height);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(VALUE_DIGITS)).toString();
}

function colorCss([red, green, blue, alpha]: Color): string {
  return `rgb(${formatNumber(red * BYTE_MAX)} ${formatNumber(green * BYTE_MAX)} ${formatNumber(blue * BYTE_MAX)} / ${formatNumber(alpha)})`;
}

function ImageView({ raster, fit, scale }: { raster: RasterData; fit: boolean; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas == null || context == null) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    context.putImageData(toImageData(raster), 0, 0);
  }, [raster]);
  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Preview ${raster.width} by ${raster.height}`}
      className="checkerboard pixelated m-auto shrink-0"
      style={
        fit ? { inlineSize: raster.width * scale, blockSize: raster.height * scale } : undefined
      }
    />
  );
}

function ValueView({ output }: { output: PrimaryOutput }) {
  switch (output.type) {
    case "number":
      return <span className="font-mono text-[1.5em]">{formatNumber(output.value as number)}</span>;
    case "vector": {
      const [x, y] = output.value as Vector;
      return (
        <span className="font-mono text-[1.5em]">
          ({formatNumber(x)}, {formatNumber(y)})
        </span>
      );
    }
    case "color": {
      const color = output.value as Color;
      return (
        <span className="flex items-center gap-3">
          <span className="checkerboard size-12 rounded-sm border border-widget-border">
            <span className="block size-full rounded-sm" style={{ background: colorCss(color) }} />
          </span>
          <span className="font-mono">{color.map(formatNumber).join(", ")}</span>
        </span>
      );
    }
    case "image":
      return null;
  }
}

function Status({ state }: { state: PreviewState }) {
  if (state.error !== undefined) {
    return (
      <span role="alert" className="flex min-w-0 items-center gap-1.5 text-error">
        <Icon name="error" />
        <span className="truncate" title={state.error.reason}>
          {state.error.node === undefined ? "" : `${state.error.node}: `}
          {state.error.reason}
        </span>
      </span>
    );
  }
  if (state.running) {
    return (
      <span className="flex items-center gap-1.5">
        <Icon name="loading codicon-modifier-spin" />
        Rendering
      </span>
    );
  }
  if (state.output?.type === "image") {
    const raster = state.output.value as RasterData;
    return (
      <span>
        {raster.width} × {raster.height}
      </span>
    );
  }
  return null;
}

export function PreviewPanel({ preview, host }: { preview: PreviewController; host: UiHost }) {
  const state = useObservable(preview);
  const [fit, setFit] = useState(true);
  const { output, nodeId } = state;
  const raster = output?.type === "image" ? (output.value as RasterData) : undefined;
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = areaRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined)
        setArea({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const scale =
    raster === undefined ? 1 : Math.min(area.width / raster.width, area.height / raster.height);

  return (
    <div className="grid size-full grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-2 border-b border-panel-border px-2 py-1">
        <span className="font-semibold">Preview</span>
        {nodeId !== undefined && <span className="font-mono">{nodeId}</span>}
        <span className="min-w-0 flex-1">
          <Status state={state} />
        </span>
        <IconButton
          icon={fit ? "screen-full" : "screen-normal"}
          label={fit ? "Show actual size" : "Fit to panel"}
          pressed={!fit}
          onClick={() => {
            setFit(!fit);
          }}
        />
        <IconButton
          icon="export"
          label="Export PNG"
          disabled={raster === undefined}
          onClick={() => {
            if (raster === undefined) return;
            void host.exportPng(
              encodePng(Raster.from(raster)),
              `${nodeId ?? "preview"}${PNG_EXTENSION}`,
            );
          }}
        />
      </div>
      <div ref={areaRef} className={`flex p-3 ${fit ? "overflow-hidden" : "scroll-area"}`}>
        {raster !== undefined && <ImageView raster={raster} fit={fit} scale={scale} />}
        {output !== undefined && output.type !== "image" && (
          <div className="m-auto">
            <ValueView output={output} />
          </div>
        )}
        {output === undefined && state.error === undefined && !state.running && (
          <p className="m-auto">Select a node or add an Output node to preview it</p>
        )}
      </div>
    </div>
  );
}
