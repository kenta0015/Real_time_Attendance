// lib/logger.ts
// --- Ultra-early global logger ------------------------------------------------
// 目的: すべての console.* を捕捉し、統一タグ [RTA] で logcat に確実に出す。
// 追加で DeviceEventEmitter にも流し、アプリ内デバッグ画面で閲覧可能にする。
// 機能変更なし（観測のみ）

import { DeviceEventEmitter, Platform } from "react-native";

type Level = "log" | "info" | "warn" | "error";
type Entry = { t: number; level: Level; msg: string };

const EMIT_EVT = "rta:log";
const MAX_LOCAL = 500;

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const localBuffer: Entry[] = [];

function emit(level: Level, args: any[]) {
  const msg = args
    .map((a) => {
      try {
        if (typeof a === "string") return a;
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");

  const entry: Entry = { t: Date.now(), level, msg };
  localBuffer.push(entry);
  if (localBuffer.length > MAX_LOCAL) localBuffer.shift();

  DeviceEventEmitter.emit(EMIT_EVT, entry);
}

function tag(level: Level, args: any[]) {
  // 端末 logcat 上で確実に拾えるように統一タグを先頭に付与
  const prefix = "[RTA]";
  return [`${prefix} ${level.toUpperCase()} —`, ...args];
}

// 初期化（多重適用ケア）
let installed = false;
export function installGlobalLogger() {
  if (installed) return;
  installed = true;

  console.log = (...args: any[]) => {
    emit("log", args);
    original.log(...tag("log", args));
  };
  console.info = (...args: any[]) => {
    emit("info", args);
    original.info(...tag("info", args));
  };
  console.warn = (...args: any[]) => {
    emit("warn", args);
    original.warn(...tag("warn", args));
  };
  console.error = (...args: any[]) => {
    emit("error", args);
    original.error(...tag("error", args));
  };

  // 起動印
  console.info(`[boot] logger installed on ${Platform.OS}`);
}

// Debug 画面用
export function getBufferedLogs(): Entry[] {
  return [...localBuffer];
}
export { EMIT_EVT };




