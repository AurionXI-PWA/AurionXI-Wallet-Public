// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  send: vi.fn(),
  refresh: vi.fn(),
  refreshHash: vi.fn(),
  active: vi.fn(),
  replace: vi.fn(),
  appChange: undefined as undefined | ((s: string) => void),
  transfers: {
    records: [] as unknown[],
    nativeRecords: [] as unknown[],
    refreshing: false,
    unavailable: false,
  },
}));
vi.mock("react-native", async () => {
  const React = await import("react");
  const host = (tag: string) => (p: Record<string, any>) =>
    React.createElement(
      tag,
      {
        "aria-label": p.accessibilityLabel,
        onClick: p.onPress,
        disabled: p.disabled,
        role: p.accessibilityRole,
      },
      p.children,
    );
  return {
    View: host("div"),
    Text: host("span"),
    Pressable: host("button"),
    ScrollView: host("section"),
    Image: () => null,
    KeyboardAvoidingView: host("div"),
    Modal: (p: Record<string, any>) =>
      p.visible
        ? React.createElement("div", { role: "dialog" }, p.children)
        : null,
    TextInput: (p: Record<string, any>) =>
      React.createElement("input", {
        "aria-label": p.accessibilityLabel,
        value: p.value,
        onInput: (e: any) => p.onChangeText?.(e.target.value),
      }),
    ActivityIndicator: host("span"),
    StyleSheet: { create: (x: unknown) => x },
    AppState: {
      addEventListener: (_name: string, listener: (s: string) => void) => {
        mocks.appChange = listener;
        return { remove: vi.fn() };
      },
    },
    Keyboard: { dismiss: vi.fn() },
    Platform: { OS: "android" },
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: mocks.replace, back: vi.fn() }),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("@/security/mainnet-native-swap", () => ({
  prepareNativeSwap: mocks.prepare,
  sendNativeSwap: mocks.send,
}));
vi.mock("@/security/mainnet-session-lock-provider", () => ({
  useMainnetSessionLock: () => ({
    isLocked: false,
    authorizationEpoch: 7,
    isAuthorizationActive: mocks.active,
  }),
}));
vi.mock("@/security/wallet-identity-record-store", () => ({
  readMainnetWalletIdentityRecord: async () => ({
    publicAddress: "0x5C8B6A179E4584e90675aac12594435BAb86E208",
  }),
}));
vi.mock("@/security/use-sensitive-screen-protection", () => ({
  useSensitiveScreenProtection: () => {},
}));
vi.mock("@/hooks/use-mainnet-transfers", () => ({
  useMainnetTransfers: () => ({
    ...mocks.transfers,
    refresh: mocks.refresh,
    refreshHash: mocks.refreshHash,
  }),
}));
vi.mock("@/services/mainnet-portfolio", () => ({
  fetchMainnetPortfolio: async () => ({
    assets: {
      bnbWei: "10000000000000000",
      arxiWei: "79000000000000000000",
      usdtWei: "5000000000000000000",
    },
    valuation: { status: "unavailable" },
  }),
}));
vi.mock("@/components/mainnet-swap-asset-icon", () => ({
  MainnetSwapAssetIcon: () => null,
}));
vi.mock("@/components/mainnet-support-report-button", () => ({
  MainnetSupportReportButton: () => null,
}));
vi.mock("@/components/mainnet-transfer-recovery-card", () => ({
  MainnetTransferRecoveryCard: () => null,
}));
import Screen from "@/app/wallet/mainnet-swap";
let root: Root, container: HTMLDivElement;
const hash = `0x${"a".repeat(64)}`;
const fixture = (
  sender: string,
  inputAsset: string,
  outputAsset: string,
  amountWei: string,
  kind = "approve",
) => ({
  chainId: 56,
  senderAddress: sender.toLowerCase(),
  inputAsset,
  outputAsset,
  amountWei,
  operation: {
    kind,
    inputAsset,
    outputAsset,
    intentAmountWei: amountWei,
    grossOutWei: "1000000000000000000",
    estimatedOutWei: "990000000000000000",
    minimumOutWei: "930000000000000000",
    taxBps: "100",
    policyHash: `0x${"b".repeat(64)}`,
    deadline: String(Math.floor(Date.now() / 1000) + 180),
  },
  estimatedOutWei: "990000000000000000",
  minimumOutWei: "930000000000000000",
  nonce: "8",
  gas: "65000",
  gasPrice: "50000000",
  observedAt: Date.now(),
  executionEnabled: true,
  remainingSteps: 2,
});
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.active.mockReturnValue(true);
  mocks.transfers = {
    records: [],
    nativeRecords: [],
    refreshing: false,
    unavailable: false,
  };
  mocks.prepare.mockImplementation(async (...args) =>
    fixture(...(args as [string, string, string, string])),
  );
  mocks.send.mockResolvedValue({ state: "submitted", transactionHash: hash });
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Screen />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
async function clickText(text: string) {
  const b = [...container.querySelectorAll("button")].find(
    (x) => x.textContent === text,
  );
  expect(b, `Missing button: ${text}`).toBeTruthy();
  await act(async () => b!.click());
}
async function clickLabel(label: string) {
  const b = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  expect(b, `Missing action ${label}`).toBeTruthy();
  await act(async () => b!.click());
}
async function amount(value = "1") {
  const input = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("Approve USDT click crosses the native send boundary when the wallet is mixed-case and quote lowercase", async () => {
  await clickLabel("Select pay asset");
  await clickLabel("Choose USDT");
  await amount();
  await clickText("Review swap");
  expect(container.textContent).toContain("Approve USDT");
  await clickText("Approve USDT");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0].senderAddress).toBe(
    "0x5c8b6a179e4584e90675aac12594435bab86e208",
  );
  expect(mocks.send.mock.calls[0][1]).toBe(7);
});
it("Approve ARXI and Confirm swap both invoke native signing from a mixed-case identity", async () => {
  await clickLabel("Select pay asset");
  await clickLabel("Choose ARXI");
  await amount();
  await clickText("Review swap");
  await clickText("Approve ARXI");
  expect(mocks.send).toHaveBeenCalledTimes(1);
});
it("BNB needs no approval and Confirm swap crosses the native boundary", async () => {
  mocks.prepare.mockImplementationOnce(async (...args) => ({
    ...fixture(...(args as [string, string, string, string]), "swap"),
    remainingSteps: 1,
  }));
  await amount("0.0001");
  await clickText("Review swap");
  await clickText("Confirm swap");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][0].operation.kind).toBe("swap");
});
it("changing amount invalidates the old review before any signing", async () => {
  await amount("0.0001");
  await clickText("Review swap");
  await amount("0.0002");
  expect(container.textContent).not.toContain("Confirm swap");
  expect(container.textContent).toContain("Review swap");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("repeated presses while native authorization is in flight cannot sign twice", async () => {
  mocks.prepare.mockImplementationOnce(async (...args) =>
    fixture(...(args as [string, string, string, string]), "swap"),
  );
  let finish: (x: unknown) => void = () => {};
  mocks.send.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await amount("0.0001");
  await clickText("Review swap");
  await clickText("Confirm swap");
  expect(container.textContent).toContain("Confirm on your phone");
  await clickLabel("Confirm on your phone…");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  await act(async () => finish({ state: "submitted", transactionHash: hash }));
});
it("disabled service and unavailable activity explain the next action instead of an inert confirmation", async () => {
  mocks.prepare.mockImplementationOnce(async (...args) => ({
    ...fixture(...(args as [string, string, string, string]), "swap"),
    executionEnabled: false,
  }));
  await amount("0.0001");
  await clickText("Review swap");
  expect(container.textContent).toContain("Swap is temporarily unavailable");
  const unavailable = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Swap unavailable"]',
  );
  expect(unavailable?.disabled).toBe(true);
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.transfers.unavailable = true;
  await act(async () => root.render(<Screen />));
  await clickText("Refresh activity");
  expect(mocks.refresh).toHaveBeenCalled();
});
it("pending operation goes to Check status and never starts another swap", async () => {
  mocks.transfers.nativeRecords = [
    { transactionHash: hash, receiptState: "pending" },
  ];
  mocks.transfers.records = mocks.transfers.nativeRecords;
  await act(async () => root.render(<Screen />));
  await clickText("Check status");
  expect(mocks.refreshHash).toHaveBeenCalledWith(hash);
  expect(mocks.prepare).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("confirmed permission fetches a fresh swap quote but never signs it automatically", async () => {
  await clickLabel("Select pay asset");
  await clickLabel("Choose USDT");
  await amount();
  await clickText("Review swap");
  await clickText("Approve USDT");
  const permission = {
    transactionHash: hash,
    receiptState: "confirmed",
    operation: { kind: "approve" },
  };
  mocks.transfers.records = [permission];
  mocks.transfers.nativeRecords = [permission];
  mocks.prepare.mockImplementationOnce(async (...args) => ({
    ...fixture(...(args as [string, string, string, string]), "swap"),
    remainingSteps: 1,
  }));
  await act(async () => root.render(<Screen />));
  expect(mocks.prepare).toHaveBeenCalledTimes(2);
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("Confirm swap");
});
it("background transition removes the quote before a later confirmation", async () => {
  mocks.prepare.mockImplementationOnce(async (...args) =>
    fixture(...(args as [string, string, string, string]), "swap"),
  );
  await amount("0.0001");
  await clickText("Review swap");
  await act(async () => mocks.appChange?.("background"));
  expect(container.textContent).not.toContain("Confirm swap");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("Max leaves BNB gas reserve and asset reversal clears the old amount and review", async () => {
  await clickLabel("Use maximum available amount");
  expect((container.querySelector("input") as HTMLInputElement).value).toBe(
    "0.0099",
  );
  await clickText("Review swap");
  await clickLabel("Reverse swap assets");
  expect((container.querySelector("input") as HTMLInputElement).value).toBe("");
  expect(container.textContent).not.toContain("Confirm swap");
});
