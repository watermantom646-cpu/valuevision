import { LegalPage } from "@/components/legal-page";

export default function PrivacyScreen() {
  return <LegalPage title="Privacy notice" updated="9 August 2026" sections={[
    { heading: "Information used", body: "Value Vision may process photographs, item descriptions, vehicle registrations, app installation identifiers, usage records, feedback and purchase references needed to provide the service." },
    { heading: "Payments", body: "Stripe and Apple process payment details. Value Vision receives transaction identifiers, product information and payment status, but does not need to store complete card numbers." },
    { heading: "Service providers", body: "Information may be sent to contracted search, AI, hosting, analytics and vehicle-data providers only where needed to produce requested results, prevent abuse and operate the service." },
    { heading: "Retention and security", body: "Value Vision limits retained information to what is needed for access, accounting, support, safety and legal obligations. Technical and organisational safeguards are used, but no internet service can guarantee absolute security." },
    { heading: "Your choices", body: "Customers may request access, correction or deletion of personal information where applicable. Some transaction records may need to be retained for accounting, fraud prevention or legal requirements." },
    { heading: "Contact", body: "Use the Support page for privacy requests. Include enough information to locate the account or transaction, but never provide a full payment-card number." },
  ]} />;
}
