import type { LiveCommand, SimConfig } from "./types";

/*
 * Run sharing (SPEC §5.7): full run state = SimConfig + ordered live
 * commands, serialized to compact JSON and base64url-encoded for the URL
 * hash. Decode + replay reconstructs the run exactly.
 */

export interface RunRecord {
  v: 1;
  config: SimConfig;
  commands: LiveCommand[];
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToB64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += B64[b2 & 0x3f];
  }
  return out;
}

function b64urlToBytes(s: string): Uint8Array {
  const vals = Array.from(s, (c) => {
    const v = B64.indexOf(c);
    if (v < 0) throw new Error("invalid base64url input");
    return v;
  });
  const bytes: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const v0 = vals[i] as number;
    const v1 = vals[i + 1] ?? 0;
    const v2 = vals[i + 2];
    const v3 = vals[i + 3];
    bytes.push((v0 << 2) | (v1 >> 4));
    if (v2 !== undefined) bytes.push(((v1 & 0x0f) << 4) | (v2 >> 2));
    if (v3 !== undefined) bytes.push(((v2 ?? 0) & 0x03) << 6 | v3);
  }
  return new Uint8Array(bytes);
}

/** Cap on encoded length; beyond it, share only the initial config and warn. */
export const SHARE_MAX_LENGTH = 1800;

export interface EncodedRun {
  encoded: string;
  /** True when commands were dropped to fit the size cap (SPEC §5.7). */
  truncated: boolean;
}

export function encodeRun(config: SimConfig, commands: readonly LiveCommand[]): EncodedRun {
  const full: RunRecord = { v: 1, config, commands: [...commands] };
  const encoded = bytesToB64url(new TextEncoder().encode(JSON.stringify(full)));
  if (encoded.length <= SHARE_MAX_LENGTH) {
    return { encoded, truncated: false };
  }
  const bare: RunRecord = { v: 1, config, commands: [] };
  return {
    encoded: bytesToB64url(new TextEncoder().encode(JSON.stringify(bare))),
    truncated: true,
  };
}

export function decodeRun(encoded: string): RunRecord {
  const record = JSON.parse(new TextDecoder().decode(b64urlToBytes(encoded))) as RunRecord;
  if (record.v !== 1 || typeof record.config !== "object" || !Array.isArray(record.commands)) {
    throw new Error("unrecognized run record");
  }
  return record;
}
