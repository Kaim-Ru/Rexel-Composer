import type { ParamSpec, Project } from "@rexel/core";
import { useId } from "react";
import type { AssetKind } from "../host.ts";
import { IconButton } from "./Icon.tsx";

const HEX_RGB_LENGTH = 7;
const ALPHA_MAX = 255;
const HEX_RADIX = 16;
const DEFAULT_SLIDER_STEP = 0.01;
const NEW_PALETTE_COLOR = "#ffffff";

interface Props {
  readonly name: string;
  readonly spec: ParamSpec;
  readonly value: unknown;
  readonly assets: Project["assets"];
  onChange: (value: unknown) => void;
  onAddAsset: (kind: AssetKind) => Promise<string | undefined>;
}

function splitHex(hex: string): { rgb: string; alpha: number } {
  const alphaHex = hex.slice(HEX_RGB_LENGTH);
  return {
    rgb: hex.slice(0, HEX_RGB_LENGTH),
    alpha: alphaHex === "" ? ALPHA_MAX : Number.parseInt(alphaHex, HEX_RADIX),
  };
}

function joinHex(rgb: string, alpha: number): string {
  return alpha >= ALPHA_MAX
    ? rgb
    : `${rgb}${Math.round(alpha).toString(HEX_RADIX).padStart(2, "0")}`;
}

function finite(text: string, fallback: number): number {
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { rgb, alpha } = splitHex(value);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <input
        type="color"
        aria-label={label}
        value={rgb}
        className="h-6 w-8 shrink-0 cursor-pointer p-0"
        onChange={(event) => {
          onChange(joinHex(event.target.value, alpha));
        }}
      />
      <input
        type="range"
        aria-label={`${label} alpha`}
        min={0}
        max={ALPHA_MAX}
        value={alpha}
        className="min-w-0 flex-1"
        onChange={(event) => {
          onChange(joinHex(rgb, Number(event.target.value)));
        }}
      />
    </span>
  );
}

export function ParamControl({ name, spec, value, assets, onChange, onAddAsset }: Props) {
  const id = useId();
  const label = (
    <label htmlFor={id} className="truncate">
      {name}
    </label>
  );

  switch (spec.kind) {
    case "number":
    case "integer": {
      const current = typeof value === "number" ? value : spec.default;
      const step = spec.kind === "integer" ? 1 : (spec.step ?? DEFAULT_SLIDER_STEP);
      const ranged = spec.min !== undefined && spec.max !== undefined;
      return (
        <Row label={label}>
          <span className="flex min-w-0 items-center gap-1.5">
            {ranged && (
              <input
                type="range"
                aria-label={name}
                min={spec.min}
                max={spec.max}
                step={step}
                value={current}
                className="min-w-0 flex-1"
                onChange={(event) => {
                  onChange(Number(event.target.value));
                }}
              />
            )}
            <input
              id={id}
              type="number"
              min={spec.min}
              max={spec.max}
              step={step}
              value={current}
              className={ranged ? "w-16 shrink-0" : "w-full"}
              onChange={(event) => {
                const next = finite(event.target.value, current);
                onChange(spec.kind === "integer" ? Math.round(next) : next);
              }}
            />
          </span>
        </Row>
      );
    }
    case "boolean":
      return (
        <Row label={label}>
          <input
            id={id}
            type="checkbox"
            checked={typeof value === "boolean" ? value : spec.default}
            className="justify-self-start"
            onChange={(event) => {
              onChange(event.target.checked);
            }}
          />
        </Row>
      );
    case "enum":
      return (
        <Row label={label}>
          <select
            id={id}
            value={typeof value === "string" ? value : spec.default}
            onChange={(event) => {
              onChange(event.target.value);
            }}
          >
            {spec.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Row>
      );
    case "color":
      return (
        <Row label={label}>
          <ColorInput
            label={name}
            value={typeof value === "string" ? value : spec.default}
            onChange={onChange}
          />
        </Row>
      );
    case "vector": {
      const current =
        Array.isArray(value) && value.length === 2 ? (value as [number, number]) : spec.default;
      return (
        <Row label={label}>
          <span className="grid grid-cols-2 gap-1.5">
            {current.map((component, index) => (
              <input
                key={index}
                id={index === 0 ? id : undefined}
                type="number"
                aria-label={`${name} ${index === 0 ? "x" : "y"}`}
                value={component}
                className="w-full"
                onChange={(event) => {
                  const next: [number, number] = [current[0], current[1]];
                  next[index] = finite(event.target.value, component);
                  onChange(next);
                }}
              />
            ))}
          </span>
        </Row>
      );
    }
    case "palette": {
      const colors = Array.isArray(value) ? (value as string[]) : [...spec.default];
      return (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span>{name}</span>
            <IconButton
              icon="add"
              label={`Add color to ${name}`}
              onClick={() => {
                onChange([...colors, NEW_PALETTE_COLOR]);
              }}
            />
          </span>
          {colors.map((color, index) => (
            <span key={index} className="flex items-center gap-1.5">
              <ColorInput
                label={`${name} ${index + 1}`}
                value={color}
                onChange={(next) => {
                  onChange(
                    colors.map((existing, position) => (position === index ? next : existing)),
                  );
                }}
              />
              <IconButton
                icon="close"
                label={`Remove color ${index + 1}`}
                onClick={() => {
                  onChange(colors.filter((_, position) => position !== index));
                }}
              />
            </span>
          ))}
        </div>
      );
    }
    case "asset": {
      const options = assets.filter((asset) => asset.kind === spec.assetKind);
      const current = typeof value === "string" ? value : "";
      return (
        <Row label={label}>
          <span className="flex min-w-0 items-center gap-1">
            <select
              id={id}
              value={current}
              className="min-w-0 flex-1"
              onChange={(event) => {
                onChange(
                  event.target.value === "" && spec.optional === true
                    ? undefined
                    : event.target.value,
                );
              }}
            >
              <option value="">None</option>
              {options.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.path}
                </option>
              ))}
            </select>
            <IconButton
              icon="folder-opened"
              label={`Choose ${spec.assetKind} file`}
              onClick={() => {
                void onAddAsset(spec.assetKind).then((assetId) => {
                  if (assetId !== undefined) onChange(assetId);
                });
              }}
            />
          </span>
        </Row>
      );
    }
  }
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-center gap-2">
      {label}
      {children}
    </div>
  );
}
