export const PLUGIN_API_VERSION = 1;

export type Vector = readonly [number, number];

export type Color = readonly [number, number, number, number];

export interface RasterData {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array<ArrayBuffer>;
}

export type PortType = "image" | "number" | "vector" | "color";

export interface PortValueMap {
  image: RasterData;
  number: number;
  vector: Vector;
  color: Color;
}

export type PortValue = PortValueMap[PortType];

export interface NumberParam {
  readonly kind: "number";
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface IntegerParam {
  readonly kind: "integer";
  readonly default: number;
  readonly min?: number;
  readonly max?: number;
}

export interface BooleanParam {
  readonly kind: "boolean";
  readonly default: boolean;
}

export interface EnumParam {
  readonly kind: "enum";
  readonly default: string;
  readonly options: readonly string[];
}

export interface ColorParam {
  readonly kind: "color";
  readonly default: string;
}

export interface VectorParam {
  readonly kind: "vector";
  readonly default: Vector;
}

export interface PaletteParam {
  readonly kind: "palette";
  readonly default: readonly string[];
}

export interface AssetParam {
  readonly kind: "asset";
  readonly assetKind: "image" | "palette";
  readonly optional?: boolean;
}

export type ParamSpec =
  | NumberParam
  | IntegerParam
  | BooleanParam
  | EnumParam
  | ColorParam
  | VectorParam
  | PaletteParam
  | AssetParam;

export type ParamValue<Spec extends ParamSpec> = Spec extends NumberParam | IntegerParam
  ? number
  : Spec extends BooleanParam
    ? boolean
    : Spec extends { readonly kind: "enum"; readonly options: readonly (infer Option)[] }
      ? Option
      : Spec extends ColorParam
        ? Color
        : Spec extends VectorParam
          ? Vector
          : Spec extends PaletteParam
            ? readonly Color[]
            : Spec extends { readonly assetKind: "image"; readonly optional: true }
              ? RasterData | undefined
              : Spec extends { readonly assetKind: "image" }
                ? RasterData
                : Spec extends { readonly optional: true }
                  ? readonly Color[] | undefined
                  : readonly Color[];

export type PortValues<Ports extends Readonly<Record<string, PortType>>> = {
  readonly [Name in keyof Ports]: PortValueMap[Ports[Name]];
};

export type ParamValues<Params extends Readonly<Record<string, ParamSpec>>> = {
  readonly [Name in keyof Params]: ParamValue<Params[Name]>;
};

export interface ProcessContext {
  readonly canvas: { readonly width: number; readonly height: number };
}

export interface PluginNode<
  Inputs extends Readonly<Record<string, PortType>> = Readonly<Record<string, PortType>>,
  Outputs extends Readonly<Record<string, PortType>> = Readonly<Record<string, PortType>>,
  Params extends Readonly<Record<string, ParamSpec>> = Readonly<Record<string, ParamSpec>>,
> {
  readonly name: string;
  readonly title: string;
  readonly inputs: Inputs;
  readonly outputs: Outputs;
  readonly params: Params;
  process: (
    inputs: PortValues<Inputs>,
    params: ParamValues<Params>,
    context: ProcessContext,
  ) => PortValues<Outputs>;
}

export interface PluginModule {
  readonly apiVersion: typeof PLUGIN_API_VERSION;
  readonly nodes: readonly PluginNode[];
}

export function definePlugin(plugin: PluginModule): PluginModule {
  return plugin;
}

export function defineNode<
  const Inputs extends Readonly<Record<string, PortType>>,
  const Outputs extends Readonly<Record<string, PortType>>,
  const Params extends Readonly<Record<string, ParamSpec>>,
>(node: PluginNode<Inputs, Outputs, Params>): PluginNode {
  return node;
}
