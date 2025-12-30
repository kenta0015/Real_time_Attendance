// lib/toast.ts
import { DeviceEventEmitter } from "react-native";

export type ToastPayload = {
  message: string;
  duration?: number; // ms
};

const EVT = "rta:toast";

export function showToast(message: string, opts?: { duration?: number }) {
  const payload: ToastPayload = { message, duration: opts?.duration ?? 2200 };
  DeviceEventEmitter.emit(EVT, payload);
}

export function subscribeToast(cb: (p: ToastPayload) => void) {
  const sub = DeviceEventEmitter.addListener(EVT, cb);
  return () => sub.remove();
}




