// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  quote: vi.fn(),
  copy: vi.fn(),
  session: {
    isLocked: false,
    authorizationEpoch: 7,
    isAuthorizationActive: vi.fn(),
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
      p.refreshControl,
      p.children,
    );
  return {
    View: host("div"),
    Text: host("span"),
    Pressable: host("button"),
    ScrollView: host("section"),
    ActivityIndicator: host("span"),
    Modal: (p: Record<string, any>) =>
      p.visible
        ? React.createElement("div", { role: "dialog" }, p.children)
        : null,
    RefreshControl: (p: Record<string, any>) =>
      React.createElement("button", {
        "aria-label": "Pull to refresh",
        onClick: p.onRefresh,
      }),
    StyleSheet: { create: (x: unknown) => x, hairlineWidth: 1 },
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: any) =>
    React.createElement("div", null, children),
}));
vi.mock("expo-status-bar", () => ({ StatusBar: () => null }));
vi.mock("expo-router", () => {
  const router = { push: mocks.push, replace: mocks.replace };
  return { useRouter: () => router, Redirect: () => null };
});
vi.mock("expo-clipboard", () => ({ setStringAsync: mocks.copy }));
vi.mock("@/security/mainnet-session-lock-provider", () => ({
  useMainnetSessionLock: () => mocks.session,
}));
vi.mock("@/security/mainnet-send-flow-provider", () => ({
  useMainnetSendFlow: () => ({ setQuote: mocks.quote }),
}));
vi.mock("@/security/vault-store", () => ({
  getMainnetVaultV3Status: async () => "present",
}));
vi.mock("@/security/wallet-identity-record-store", () => ({
  readMainnetWalletIdentityRecord: async () => ({
    publicAddress: "0x5C8B6A179E4584e90675aac12594435BAb86E208",
  }),
}));
vi.mock("@/services/mainnet-portfolio", () => ({
  fetchMainnetPortfolio: mocks.fetch,
}));
vi.mock("@/components/mainnet-wallet-brand-mark", () => ({
  MainnetWalletBrandMark: () => null,
}));
import Screen from "@/app/wallet/mainnet-readonly";
const fixture = {
  chainId: 56,
  blockNumber: "68000000",
  assets: {
    bnbWei: "10000000000000000",
    arxiWei: "1234567123456789000000000",
    usdtWei: "5000000000000000000",
  },
  quote: {
    pendingNonce: "8",
    gasPriceWei: "50000000",
    observedAt: "2026-10-06T12:00:00Z",
  },
  valuation: {
    status: "available",
    totalUsd: "550707.39",
    assets: {
      arxi: { priceUsd: "0.0553", valueUsd: "550628.22" },
      usdt: { priceUsd: "1", valueUsd: "5.00" },
      bnb: { priceUsd: "784.59", valueUsd: "7.85" },
    },
  },
};
let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.session.isLocked = false;
  mocks.session.isAuthorizationActive.mockImplementation(
    () => !mocks.session.isLocked,
  );
  mocks.fetch.mockResolvedValue(fixture);
  mocks.copy.mockResolvedValue(undefined);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(Screen)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
async function click(label: string) {
  const b = container.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  expect(b).toBeTruthy();
  await act(async () => b!.click());
}
it("renders actual totals, grouped token balances and only one initial read", () => {
  expect(container.textContent).toContain("$550,707.39");
  expect(container.textContent).toContain("1,234,567.123456 ARXI");
  expect(container.textContent).not.toContain("+8.29%");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(
    container.querySelector('[aria-label="Mainnet wallet address"]')
      ?.textContent,
  ).toBe("0x5C8B6A179E4584e90675aac12594435BAb86E208");
});
it("opens existing Swap, Receive, History and Assets routes from real buttons", async () => {
  await click("Swap BNB, ARXI or USDT");
  expect(mocks.push).toHaveBeenLastCalledWith("/wallet/mainnet-swap");
  await click("Receive assets");
  expect(mocks.push).toHaveBeenLastCalledWith("/wallet/mainnet-receive");
  await click("Open activity history");
  expect(mocks.push).toHaveBeenLastCalledWith("/wallet/mainnet-activity");
  await click("View all assets");
  expect(mocks.push).toHaveBeenLastCalledWith("/wallet/mainnet-assets");
});
it("passes the current public balance and fee snapshot into Send before navigation", async () => {
  await click("Send assets");
  expect(mocks.quote).toHaveBeenCalledWith(
    expect.objectContaining({
      walletAddress: "0x5C8B6A179E4584e90675aac12594435BAb86E208",
      chainId: 56,
      usdtWei: fixture.assets.usdtWei,
      blockNumber: fixture.blockNumber,
      pendingNonce: "8",
    }),
  );
  expect(mocks.push).toHaveBeenCalledWith("/wallet/mainnet-send-review");
});
it("copies the complete wallet identity and opens full address and token detail sheets", async () => {
  await click("Copy Mainnet wallet address");
  expect(mocks.copy).toHaveBeenCalledWith(
    "0x5C8B6A179E4584e90675aac12594435BAb86E208",
  );
  await click("Open wallet account");
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
    "0x5C8B6A179E4584e90675aac12594435BAb86E208",
  );
  await click("Close details");
  await click("View USDT details");
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
    "0x55d398326f99059fF775485246999027B3197955",
  );
});
it("retains visible balances on refresh failure and offers a user initiated retry", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("offline"));
  await click("Pull to refresh");
  expect(container.textContent).toContain("Could not refresh balances");
  expect(container.textContent).toContain("$550,707.39");
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  const retry = [...container.querySelectorAll("button")].find(
    (b) => b.textContent === "Retry",
  );
  await act(async () => retry!.click());
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(container.textContent).not.toContain("Could not refresh balances");
});
it("does not poll balances when time passes", async () => {
  vi.useFakeTimers();
  await act(async () => vi.advanceTimersByTime(120000));
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});
it("hides public account and rejects a late refresh response after the session locks", async () => {
  let resolve: (x: typeof fixture) => void;
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  await click("Pull to refresh");
  mocks.session.isLocked = true;
  await act(async () => root.render(React.createElement(Screen)));
  await act(async () =>
    resolve!({
      ...fixture,
      valuation: { ...fixture.valuation, totalUsd: "999999.99" },
    }),
  );
  expect(container.textContent).not.toContain("999999.99");
  expect(container.textContent).not.toContain("AurionXI Wallet");
  expect(mocks.replace).toHaveBeenCalledWith("/wallet/mainnet-unlock");
});
