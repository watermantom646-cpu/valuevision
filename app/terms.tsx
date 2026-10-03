import { LegalPage } from "@/components/legal-page";

export default function TermsScreen() {
  return <LegalPage title="Terms of service" updated="9 August 2026" sections={[
    { heading: "The service", body: "Value Vision provides estimated resale values, listing assistance, item research and optional vehicle-data reports. Estimates are guidance rather than guaranteed sale prices, offers or professional valuations." },
    { heading: "Purchases", body: "The price and included allowance are shown before purchase. Web payments are processed by Stripe. iPhone purchases are processed by Apple. Apple refunds and subscription management are handled through the purchaser's Apple account." },
    { heading: "Subscriptions and credits", body: "Subscriptions renew until cancelled through the payment provider. ValueVision Plus includes 100 Value Credits every 30 days. One completed item valuation or Treasure Hunt item uses one Value Credit. A basic car valuation uses three Value Credits. Monthly credits reset each billing period and do not roll over. Purchased Value Credit top-ups and one-time full vehicle-check credits remain available until used, unless a refund or chargeback reverses the purchase." },
    { heading: "Third-party information", body: "Search results, market prices and vehicle records can be incomplete, delayed or incorrect. Customers should independently verify important information before buying, selling, insuring or financing an item or vehicle." },
    { heading: "Acceptable use", body: "Customers must not abuse, automate, resell or attempt to bypass usage limits, payment controls or provider restrictions. Access may be limited where necessary to protect customers, providers and service availability." },
    { heading: "Support", body: "If payment access is not delivered or a report fails, contact Value Vision support with the date, platform and transaction reference. Do not send full card details." },
  ]} />;
}
