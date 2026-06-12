import type { ShotResult } from "./types";

export function formatResult(result: ShotResult, json: boolean): string {
  if (json) return `${JSON.stringify(result, null, 2)}\n`;
  const image = result.image
    ? `${result.image.width}x${result.image.height} ${result.image.format} -> ${result.image.path} (~${formatK(result.image.tokens)} img tokens)`
    : "no image";
  const lines = [`target: ${result.target} · ${image}`];
  const notes = [...result.notes, ...(result.image?.notes ?? []), ...(result.text?.notes ?? [])].filter(Boolean);
  if (notes.length) lines.push(`notes: ${notes.join("; ")}`);
  if (result.text) {
    lines.push(`TEXT (${result.text.source}):`);
    lines.push(result.text.text || "(no text found)");
  }
  return `${lines.join("\n")}\n`;
}

function formatK(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}k`;
}
