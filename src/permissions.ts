// macOS TCC permission checks/requests via CoreGraphics + ApplicationServices.
//
// shotport captures the screen, which needs the Screen Recording permission.
// Rather than making users hand-add the binary in System Settings, we ask the
// OS directly: CGRequestScreenCaptureAccess() fires the prompt *and* registers
// shotport in the Screen Recording list the first time it runs.
//
// FFI is macOS-only and best-effort — any failure degrades to "unsupported" so
// shotport still runs (a capture then surfaces the real permission error).

import { dlopen, FFIType } from "bun:ffi";

export type PermissionState = "granted" | "denied" | "unsupported";

const isMac = process.platform === "darwin";

const CORE_GRAPHICS = "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics";
const APPLICATION_SERVICES = "/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices";

type CGSymbols = {
  CGPreflightScreenCaptureAccess: () => boolean;
  CGRequestScreenCaptureAccess: () => boolean;
};
type AXSymbols = { AXIsProcessTrusted: () => boolean };

let cg: CGSymbols | null | undefined;
let ax: AXSymbols | null | undefined;

function coreGraphics(): CGSymbols | null {
  if (cg !== undefined) return cg;
  try {
    const lib = dlopen(CORE_GRAPHICS, {
      CGPreflightScreenCaptureAccess: { args: [], returns: FFIType.bool },
      CGRequestScreenCaptureAccess: { args: [], returns: FFIType.bool },
    });
    cg = lib.symbols as unknown as CGSymbols;
  } catch {
    cg = null;
  }
  return cg;
}

function applicationServices(): AXSymbols | null {
  if (ax !== undefined) return ax;
  try {
    const lib = dlopen(APPLICATION_SERVICES, {
      AXIsProcessTrusted: { args: [], returns: FFIType.bool },
    });
    ax = lib.symbols as unknown as AXSymbols;
  } catch {
    ax = null;
  }
  return ax;
}

/** Current Screen Recording status without prompting. */
export function hasScreenRecording(): PermissionState {
  if (!isMac) return "unsupported";
  const lib = coreGraphics();
  if (!lib) return "unsupported";
  try {
    return lib.CGPreflightScreenCaptureAccess() ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/**
 * Ask for Screen Recording. The first time, macOS shows the prompt and adds
 * shotport to System Settings → Privacy & Security → Screen Recording; after a
 * decision it just returns the current state (no repeat prompt).
 */
export function requestScreenRecording(): PermissionState {
  if (!isMac) return "unsupported";
  const lib = coreGraphics();
  if (!lib) return "unsupported";
  try {
    return lib.CGRequestScreenCaptureAccess() ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

/** Accessibility status without prompting (used for a11y text; guiport can also provide it). */
export function hasAccessibility(): PermissionState {
  if (!isMac) return "unsupported";
  const lib = applicationServices();
  if (!lib) return "unsupported";
  try {
    return lib.AXIsProcessTrusted() ? "granted" : "denied";
  } catch {
    return "unsupported";
  }
}

export const SETTINGS_URL = {
  screenRecording: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
} as const;
