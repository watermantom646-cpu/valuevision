import { LegalPage } from "@/components/legal-page";

const supportEmail = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "support@valuevision.app";

export default function SupportScreen() {
  return <LegalPage title="Customer support" updated="9 August 2026" sections={[
    { heading: "Payment not showing", body: "On iPhone, use Restore Purchases and keep the app open briefly while Apple confirms the transaction. On web, return through the payment-success page. A completed payment is never charged again by using restore or payment confirmation." },
    { heading: "Report problem", body: "Keep the failed result visible and tell us the approximate time, device platform and transaction reference. Do not send card numbers, passwords or API keys." },
    { heading: `Email ${supportEmail}`, body: "Email the address shown for payment, privacy or report support. We aim to investigate payment-access problems promptly. Refunds remain subject to the payment provider's process and applicable consumer rights." },
  ]} />;
}
