"use strict";

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPage(title, intro, sections, supportEmail) {
  const safeEmail = escapeHtml(supportEmail);
  const sectionHtml = sections
    .map(({ heading, body }) => `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p></section>`)
    .join("");
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} | Value Vision</title>
  <style>
    :root { --ink:#17211c; --muted:#5d6a63; --paper:#f4f0e7; --card:#fffdf7; --line:#d8d0bf; --accent:#087f5b; }
    * { box-sizing:border-box; }
    body { margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0%, #d9f0e4 0, transparent 34rem), var(--paper); font:17px/1.65 Georgia, "Times New Roman", serif; }
    main { width:min(760px, calc(100% - 32px)); margin:48px auto; padding:clamp(24px, 6vw, 58px); background:var(--card); border:1px solid var(--line); border-radius:28px; box-shadow:0 20px 70px rgba(37,45,39,.10); }
    .eyebrow { color:var(--accent); font:700 13px/1.2 ui-sans-serif, sans-serif; letter-spacing:.12em; text-transform:uppercase; }
    h1 { max-width:14ch; margin:.35em 0 .25em; font-size:clamp(40px, 8vw, 70px); line-height:.95; letter-spacing:-.045em; }
    h2 { margin:1.5em 0 .2em; font:700 20px/1.3 ui-sans-serif, sans-serif; }
    p { margin:.4em 0; }
    .intro { color:var(--muted); font-size:20px; }
    nav { display:flex; flex-wrap:wrap; gap:16px; margin-top:36px; padding-top:22px; border-top:1px solid var(--line); font:700 14px/1.3 ui-sans-serif, sans-serif; }
    a { color:var(--accent); }
    footer { margin-top:30px; color:var(--muted); font:14px/1.5 ui-sans-serif, sans-serif; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">Value Vision</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="intro">${escapeHtml(intro)}</p>
    ${sectionHtml}
    <nav aria-label="Legal and support">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
      <a href="mailto:${safeEmail}">Email support</a>
    </nav>
    <footer>Last updated 12 September 2026. Value Vision, United Kingdom.</footer>
  </main>
</body>
</html>`;
}

function registerPublicPages(app) {
  const supportEmail = clean(process.env.SUPPORT_EMAIL) || "support@valuevision.app";
  const send = (res, title, intro, sections) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.type("html").send(renderPage(title, intro, sections, supportEmail));
  };

  app.get(["/privacy", "/privacy-policy"], (_req, res) => send(res, "Privacy notice", "How Value Vision uses information when you identify and value items or vehicles.", [
    { heading: "Information we use", body: "We may process photographs, item descriptions, vehicle registration marks, optional mileage, app installation identifiers, usage records, feedback and purchase references needed to provide and protect the service." },
    { heading: "Why we use it", body: "We use this information to identify items and vehicles, provide valuation guidance and requested vehicle records, manage allowances and purchases, prevent abuse, answer support requests and meet legal obligations." },
    { heading: "Service providers", body: "Requested information may be sent to contracted hosting, artificial-intelligence, search, analytics, payment and vehicle-data providers where necessary to deliver the service. We do not sell personal information." },
    { heading: "Payments", body: "Apple processes iPhone payments. Value Vision receives transaction identifiers, product information and payment status, but does not receive or store complete payment-card numbers." },
    { heading: "Retention and security", body: "We retain information only as long as reasonably needed for service access, accounting, support, fraud prevention and legal obligations. We use technical and organisational safeguards, but no internet service can guarantee absolute security." },
    { heading: "Your rights", body: "You may ask for access, correction or deletion of personal information where applicable. Some transaction records may need to be retained for accounting, fraud prevention or legal requirements." },
    { heading: "Contact", body: `For privacy questions or requests, email ${supportEmail}. Never include passwords, API keys or complete payment-card details.` },
  ]));

  app.get("/terms", (_req, res) => send(res, "Terms of service", "Important conditions for using Value Vision valuations and vehicle reports.", [
    { heading: "The service", body: "Value Vision provides item identification, estimated resale values, listing assistance and optional vehicle-data reports. Estimates are guidance, not guaranteed sale prices, offers or professional valuations." },
    { heading: "Vehicle information", body: "Vehicle records can be incomplete, delayed or incorrect. A clear result means no matching record was returned by the queried provider; it is not a guarantee that an event never occurred. Independently verify important information before buying, selling, insuring or financing a vehicle." },
    { heading: "Purchases", body: "The price and included allowance are shown before purchase. iPhone purchases are processed by Apple. Subscriptions renew until cancelled through the purchaser's Apple account. Apple manages App Store refunds." },
    { heading: "Allowances and credits", body: "Monthly scan allowances reset each billing period and do not roll over. One-time vehicle-report credits remain available until used unless Apple refunds or revokes the transaction." },
    { heading: "Acceptable use", body: "You must not automate, resell, abuse or attempt to bypass usage limits, payment controls or provider restrictions. We may limit access where necessary to protect customers, providers and service availability." },
    { heading: "Support", body: `If paid access is not delivered or a report fails, email ${supportEmail} with the approximate time, platform and Apple transaction reference.` },
  ]));

  app.get("/support", (_req, res) => send(res, "Customer support", "Help with scans, vehicle reports, App Store purchases and privacy requests.", [
    { heading: "Payment not showing", body: "Open Value Vision's purchase screen, choose Restore Purchases and keep the app open while Apple confirms the transaction. Restoring does not charge you again." },
    { heading: "Report problem", body: "Keep the failed result visible and note the approximate time, vehicle registration or item type, device model and Apple transaction reference. Do not send card numbers, passwords or API keys." },
    { heading: "Contact us", body: `Email ${supportEmail}. We aim to investigate payment-access and failed-report problems promptly. Refunds remain subject to Apple's process and applicable consumer rights.` },
  ]));
}

module.exports = { registerPublicPages };
