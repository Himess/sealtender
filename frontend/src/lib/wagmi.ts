import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
if (!projectId && typeof window !== "undefined") {
  // WalletConnect's relay refuses unrecognised project IDs, which silently
  // breaks the QR-code / mobile-deep-link wallets. Surface a console warning
  // so devs notice the missing env var on first page load instead of debugging
  // a vanished modal.
  // eslint-disable-next-line no-console
  console.warn(
    "[SealTender] NEXT_PUBLIC_WC_PROJECT_ID is unset — WalletConnect-based wallets will not work. Set it in .env.local."
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "SealTender",
  projectId: projectId || "00000000000000000000000000000000",
  chains: [sepolia],
  ssr: true,
});
