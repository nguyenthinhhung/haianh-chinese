import type { ContentLimits, EditorField, EditorFieldSpec } from "./template";

export type Path = (string | number)[];

export interface AssetRefUse {
  assetId: string;
  assetKind: "image" | "audio";
  path: Path;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every asset ID referenced by `content`, found through the template's editor spec. */
export function collectAssetRefs(content: unknown, fields: EditorFieldSpec, base: Path = []): AssetRefUse[] {
  if (!isRecord(content)) return [];
  const out: AssetRefUse[] = [];
  for (const field of fields) {
    const value = content[field.key];
    if (field.kind === "asset" && typeof value === "string" && value) {
      out.push({ assetId: value, assetKind: field.assetKind, path: [...base, field.key] });
    } else if (field.kind === "list" && Array.isArray(value)) {
      value.forEach((item, i) => out.push(...collectAssetRefs(item, field.fields, [...base, field.key, i])));
    }
  }
  return out;
}

/**
 * Human-readable location of a path inside slide content, using the editor
 * labels: `["words", 1, "pinyin"]` → `["từ 2", "Pinyin"]`.
 */
export function describeContentPath(path: Path, fields: EditorFieldSpec): string[] {
  const parts: string[] = [];
  let current: EditorFieldSpec | undefined = fields;
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    const field: EditorField | undefined = current?.find((f) => f.key === seg);
    if (!field) {
      parts.push(String(seg));
      current = undefined;
      continue;
    }
    if (field.kind === "list") {
      const next = path[i + 1];
      if (typeof next === "number") {
        parts.push(`${field.itemLabel} ${next + 1}`);
        i++;
      } else {
        parts.push(field.label);
      }
      current = field.fields;
    } else {
      parts.push(field.label);
      current = undefined;
    }
  }
  return parts;
}

export interface LimitWarning {
  path: Path;
  message: string;
}

/** Soft-limit warnings for content that will likely overflow the slide. */
export function checkLimits(content: unknown, limits: ContentLimits): LimitWarning[] {
  const warnings: LimitWarning[] = [];
  for (const [pattern, limit] of Object.entries(limits)) {
    for (const { value, path } of expand(content, pattern.split("."), [])) {
      if (limit.maxItems !== undefined && Array.isArray(value) && value.length > limit.maxItems) {
        warnings.push({ path, message: `Nhiều hơn ${limit.maxItems} mục, slide có thể bị chật` });
      }
      if (limit.maxChars !== undefined && typeof value === "string" && [...value].length > limit.maxChars) {
        warnings.push({ path, message: `Dài hơn ${limit.maxChars} ký tự, chữ có thể tràn khung` });
      }
    }
  }
  return warnings;
}

function expand(value: unknown, segments: string[], path: Path): { value: unknown; path: Path }[] {
  if (segments.length === 0) return [{ value, path }];
  const [head, ...rest] = segments as [string, ...string[]];
  if (head === "*") {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, i) => expand(item, rest, [...path, i]));
  }
  if (!isRecord(value)) return [];
  return expand(value[head], rest, [...path, head]);
}

export function getIn(value: unknown, path: Path): unknown {
  let cur = value;
  for (const seg of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[seg];
  }
  return cur;
}
