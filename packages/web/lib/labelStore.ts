/**
 * Lightweight node->label store so `ensName` (`${label}.warden.eth`) can be
 * derived for agents created via the API. This is display metadata only — the
 * ENS subname + Guard policy are the real on-chain source of truth; losing this
 * file only degrades the display name to the raw node, never authority.
 *
 * Persisted as JSON under a data dir (gitignored). Reads/writes are synchronous
 * and best-effort; failures degrade gracefully to an empty map.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_FILE = join(process.cwd(), "data", "labels.json");

export function readLabels(): Record<string, string> {
  try {
    if (!existsSync(DATA_FILE)) return {};
    const raw = readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveLabel(node: string, label: string): void {
  try {
    const labels = readLabels();
    labels[node] = label;
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(labels, null, 2));
  } catch {
    // best-effort — display metadata only
  }
}
