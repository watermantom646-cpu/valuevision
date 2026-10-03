import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'store/apple/current/en-US');
const svgRoot = path.resolve(process.cwd(), 'app-store-launch/svg');
const metadataRoot = path.resolve(process.cwd(), 'app-store-launch');

const palettes = {
  bg: '#061710',
  panel: '#10271e',
  panelSoft: '#173428',
  ink: '#f5f0e4',
  muted: '#a9b8b0',
  lime: '#d8ff43',
  mint: '#86e5c0',
  coral: '#f28e70',
  line: '#294a3b',
  black: '#06100b',
};

const screens = [
  {
    file: '01_home',
    kicker: 'VALUEVISION',
    title: ['VALUE WHAT', 'YOU OWN.'],
    intro: 'Three focused ways to identify value, check a vehicle and find promising resale opportunities.',
    kind: 'home',
  },
  {
    file: '02_item_value',
    kicker: 'VALUE AN ITEM',
    title: ['ONE PHOTO.', 'A SMARTER PRICE.'],
    intro: 'Identification, a realistic selling range and market evidence - with honest confidence guidance.',
    kind: 'item',
  },
  {
    file: '03_car_mode',
    kicker: 'CAR MODE',
    title: ['SCAN A PLATE.', 'KNOW THE CAR.'],
    intro: 'Start with useful vehicle facts and a market valuation. A basic car valuation uses three Value Credits.',
    kind: 'car',
  },
  {
    file: '04_full_check',
    kicker: 'FULL CAR CHECK',
    title: ['FULL HISTORY.', 'CLEARER DECISIONS.'],
    intro: 'Unlock finance, write-off, stolen, ownership and mileage-risk records from the vehicle-data provider.',
    kind: 'check',
  },
  {
    file: '05_treasure_hunt',
    kicker: 'TREASURE HUNT',
    title: ['SCAN A ROOM.', 'FIND WHAT MATTERS.'],
    intro: 'Photograph a room, shelf or collection. ValueVision ranks visible finds worth a closer look.',
    kind: 'treasure',
  },
  {
    file: '06_credits',
    kicker: 'SIMPLE PRICING',
    title: ['START FREE.', 'GO FURTHER.'],
    intro: 'Use credits for everyday valuations, then buy a full vehicle-history check only when you need one.',
    kind: 'pricing',
  },
];

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const rounded = (x, y, width, height, fill, radius = 34, stroke = 'none', strokeWidth = 0) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;

const text = (x, y, value, size, fill, weight = 400, anchor = 'start', family = 'Arial, sans-serif', spacing = 0) =>
  `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}">${escapeXml(value)}</text>`;

const wrapText = (x, y, lines, size, lineHeight, fill, weight = 400, family = 'Arial, sans-serif') =>
  lines.map((line, index) => text(x, y + (index * lineHeight), line, size, fill, weight, 'start', family)).join('\n');

const logo = (x, y, size) => {
  const badge = size * 0.78;
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="${size * 0.08}" width="${badge}" height="${badge}" rx="${size * 0.18}" fill="${palettes.lime}" transform="rotate(-8 ${badge / 2} ${badge / 2})"/>
      ${text(badge / 2, size * 0.65, 'V', size * 0.52, palettes.black, 900, 'middle', 'Arial, sans-serif')}
      <circle cx="${size * 0.78}" cy="${size * 0.18}" r="${size * 0.105}" fill="${palettes.coral}"/>
    </g>`;
};

const pill = (x, y, width, label, fill, color, size = 28) => `
  ${rounded(x, y, width, 64, fill, 32)}
  ${text(x + (width / 2), y + 42, label, size, color, 700, 'middle')}`;

const statusRow = (x, y, width, label, value, color = palettes.mint) => `
  ${rounded(x, y, width, 84, palettes.panelSoft, 24)}
  <circle cx="${x + 34}" cy="${y + 42}" r="9" fill="${color}"/>
  ${text(x + 58, y + 51, label, 27, palettes.ink, 600)}
  ${text(x + width - 28, y + 51, value, 26, color, 700, 'end')}`;

function homeContent(x, y, width) {
  const gap = 22;
  const cardH = 220;
  const cards = [
    ['01', 'VALUE AN ITEM', 'One clear photo', palettes.lime],
    ['02', 'FULL CAR CHECK', 'From plate to history', palettes.coral],
    ['03', 'TREASURE HUNT', 'Rank promising finds', palettes.mint],
  ];

  return `
    ${rounded(x, y, width, 188, palettes.ink, 38)}
    ${text(x + 44, y + 62, 'YOUR STARTER BALANCE', 24, palettes.black, 800, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 44, y + 130, '3 Value Credits', 51, palettes.black, 800, 'start', 'Georgia, serif')}
    ${pill(x + width - 240, y + 75, 196, 'READY TO SCAN', palettes.lime, palettes.black, 21)}
    ${cards.map((card, index) => {
      const cy = y + 220 + (index * (cardH + gap));
      return `
        ${rounded(x, cy, width, cardH, palettes.panel, 38, palettes.line, 2)}
        ${rounded(x + 30, cy + 34, 114, 114, card[3], 30)}
        ${text(x + 87, cy + 108, card[0], 32, palettes.black, 900, 'middle')}
        ${text(x + 174, cy + 82, card[1], 28, palettes.muted, 800, 'start', 'Arial, sans-serif', 2)}
        ${text(x + 174, cy + 137, card[2], 38, palettes.ink, 700, 'start', 'Georgia, serif')}
        ${text(x + width - 52, cy + 127, '›', 60, card[3], 400, 'middle', 'Arial, sans-serif')}`;
    }).join('\n')}
  `;
}

function itemContent(x, y, width) {
  return `
    ${rounded(x, y, width, 390, palettes.panelSoft, 42)}
    <g transform="translate(${x + (width / 2) - 155} ${y + 74})">
      <rect x="0" y="40" width="310" height="188" rx="28" fill="${palettes.ink}"/>
      <rect x="48" y="0" width="104" height="65" rx="18" fill="${palettes.coral}"/>
      <circle cx="155" cy="134" r="71" fill="${palettes.bg}" stroke="${palettes.lime}" stroke-width="18"/>
      <circle cx="155" cy="134" r="27" fill="${palettes.mint}"/>
      <circle cx="263" cy="83" r="12" fill="${palettes.coral}"/>
    </g>
    ${pill(x + 36, y + 302, 202, 'HIGH CONFIDENCE', palettes.mint, palettes.black, 20)}
    ${text(x + width - 38, y + 343, '12 exact matches', 25, palettes.muted, 600, 'end')}
    ${rounded(x, y + 420, width, 420, palettes.ink, 42)}
    ${text(x + 40, y + 476, 'IDENTIFIED', 23, palettes.black, 800, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 40, y + 548, 'Vintage 35mm camera', 45, palettes.black, 800, 'start', 'Georgia, serif')}
    ${text(x + 40, y + 620, 'Likely selling range', 25, '#506159', 600)}
    ${text(x + 40, y + 718, '&#163;95 - &#163;135', 76, palettes.black, 800, 'start', 'Georgia, serif')}
    ${text(x + 40, y + 784, 'Best evidence-led estimate: &#163;115', 27, '#405149', 700)}
    ${rounded(x, y + 870, width, 170, palettes.panel, 34, palettes.line, 2)}
    ${text(x + 38, y + 926, 'WHY THIS RANGE', 22, palettes.lime, 800, 'start', 'Arial, sans-serif', 2)}
    ${wrapText(x + 38, y + 982, ['Exact-model evidence was checked for condition,', 'bundles, accessories and unsuitable comparisons.'], 27, 39, palettes.ink, 500)}
  `;
}

function carContent(x, y, width) {
  const half = (width - 22) / 2;
  return `
    ${rounded(x, y, width, 174, '#f7e86d', 34)}
    ${text(x + (width / 2), y + 112, 'AB12 CDE', 70, palettes.black, 900, 'middle', 'Arial, sans-serif', 7)}
    ${text(x, y + 230, 'EXAMPLE BASIC REPORT', 24, palettes.muted, 800, 'start', 'Arial, sans-serif', 2)}
    ${rounded(x, y + 260, width, 260, palettes.ink, 38)}
    ${text(x + 36, y + 325, '2018 Ford Fiesta', 46, palettes.black, 800, 'start', 'Georgia, serif')}
    ${text(x + 36, y + 382, '1.0 EcoBoost Titanium', 27, '#52645a', 600)}
    ${pill(x + 36, y + 420, 202, '3 CREDITS', palettes.lime, palettes.black, 22)}
    ${text(x + width - 36, y + 462, 'Market value  &#163;6,900', 29, palettes.black, 800, 'end')}
    ${statusRow(x, y + 550, half, 'MOT', 'VALID')}
    ${statusRow(x + half + 22, y + 550, half, 'TAX', 'TAXED')}
    ${statusRow(x, y + 654, width, 'Latest recorded mileage', '64,210 mi')}
    ${rounded(x, y + 772, width, 250, palettes.panel, 36, palettes.line, 2)}
    ${text(x + 36, y + 832, 'NEED THE COMPLETE HISTORY?', 23, palettes.coral, 800, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 36, y + 900, 'Unlock a Full Car Check', 40, palettes.ink, 700, 'start', 'Georgia, serif')}
    ${text(x + 36, y + 956, 'Finance, write-off, stolen and mileage-risk records', 25, palettes.muted, 500)}
    ${pill(x + width - 202, y + 840, 166, '&#163;4.50', palettes.coral, palettes.black, 28)}
  `;
}

function checkContent(x, y, width) {
  const half = (width - 20) / 2;
  const tiles = [
    ['FINANCE', 'CLEAR', palettes.mint],
    ['STOLEN', 'CLEAR', palettes.mint],
    ['WRITE-OFF', 'CLEAR', palettes.mint],
    ['MILEAGE', 'CHECKED', palettes.lime],
  ];
  return `
    ${rounded(x, y, width, 150, palettes.coral, 36)}
    ${text(x + 38, y + 62, 'FULL CAR CHECK', 24, palettes.black, 900, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 38, y + 117, '&#163;4.50', 54, palettes.black, 900, 'start', 'Georgia, serif')}
    ${text(x + width - 36, y + 93, 'or 3 checks for &#163;11.99', 27, palettes.black, 700, 'end')}
    ${tiles.map((tile, index) => {
      const tx = x + ((index % 2) * (half + 20));
      const ty = y + 184 + (Math.floor(index / 2) * 154);
      return `
        ${rounded(tx, ty, half, 132, palettes.panel, 30, palettes.line, 2)}
        <circle cx="${tx + 34}" cy="${ty + 38}" r="9" fill="${tile[2]}"/>
        ${text(tx + 56, ty + 47, tile[0], 22, palettes.muted, 800, 'start', 'Arial, sans-serif', 1)}
        ${text(tx + 30, ty + 98, tile[1], 31, palettes.ink, 800)}`;
    }).join('\n')}
    ${rounded(x, y + 510, width, 288, palettes.ink, 38)}
    ${text(x + 36, y + 568, 'MILEAGE HISTORY', 23, palettes.black, 800, 'start', 'Arial, sans-serif', 2)}
    <polyline points="${x + 46},${y + 728} ${x + 210},${y + 678} ${x + 380},${y + 647} ${x + 550},${y + 606} ${x + width - 44},${y + 576}" fill="none" stroke="${palettes.black}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="${x + 46}" y1="${y + 742}" x2="${x + width - 44}" y2="${y + 742}" stroke="#c6d0c9" stroke-width="3"/>
    ${text(x + 36, y + 778, 'No mileage discrepancy detected in available records', 25, '#405149', 700)}
    ${rounded(x, y + 832, width, 174, palettes.panelSoft, 32)}
    ${text(x + 34, y + 886, 'PROVIDER DATA', 21, palettes.lime, 800, 'start', 'Arial, sans-serif', 2)}
    ${wrapText(x + 34, y + 938, ['Results reflect available provider records.', 'Some fields or damage images may not exist for every car.'], 25, 37, palettes.ink, 500)}
  `;
}

function treasureContent(x, y, width) {
  return `
    ${rounded(x, y, width, 445, '#d4c5a5', 42)}
    <rect x="${x + 48}" y="${y + 62}" width="${width - 96}" height="300" rx="24" fill="#bea985"/>
    <rect x="${x + 88}" y="${y + 166}" width="210" height="148" rx="20" fill="#6f4d33"/>
    <circle cx="${x + 182}" cy="${y + 145}" r="62" fill="#e6d37a"/>
    <rect x="${x + 400}" y="${y + 112}" width="180" height="204" rx="18" fill="#28443a"/>
    <rect x="${x + 625}" y="${y + 198}" width="180" height="118" rx="18" fill="#e7eee8"/>
    <rect x="${x + 65}" y="${y + 95}" width="245" height="240" rx="24" fill="none" stroke="${palettes.lime}" stroke-width="7"/>
    <rect x="${x + 377}" y="${y + 87}" width="225" height="250" rx="24" fill="none" stroke="${palettes.coral}" stroke-width="7"/>
    <rect x="${x + 604}" y="${y + 174}" width="222" height="169" rx="24" fill="none" stroke="${palettes.mint}" stroke-width="7"/>
    ${pill(x + 72, y + 72, 70, '1', palettes.lime, palettes.black, 26)}
    ${pill(x + 385, y + 65, 70, '2', palettes.coral, palettes.black, 26)}
    ${pill(x + 612, y + 152, 70, '3', palettes.mint, palettes.black, 26)}
    ${text(x + 32, y + 408, '3 promising finds ranked', 27, palettes.black, 800)}
    ${statusRow(x, y + 478, width, '1  Vintage table lamp', '&#163;45 - &#163;70', palettes.lime)}
    ${statusRow(x, y + 582, width, '2  Belt-drive turntable', '&#163;80 - &#163;130', palettes.coral)}
    ${statusRow(x, y + 686, width, '3  Ceramic vase', 'ADD CLOSE-UP', palettes.mint)}
    ${rounded(x, y + 816, width, 180, palettes.panel, 34, palettes.line, 2)}
    ${text(x + 34, y + 872, 'HONEST BY DESIGN', 22, palettes.lime, 800, 'start', 'Arial, sans-serif', 2)}
    ${wrapText(x + 34, y + 926, ['A room scan creates a shortlist. Add close-ups for', 'stronger identification before relying on a price.'], 26, 38, palettes.ink, 500)}
  `;
}

function pricingContent(x, y, width) {
  return `
    ${rounded(x, y, width, 152, palettes.ink, 36)}
    ${text(x + 34, y + 60, 'FREE DOWNLOAD', 22, palettes.black, 900, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 34, y + 116, '3 starter Value Credits', 39, palettes.black, 800, 'start', 'Georgia, serif')}
    ${rounded(x, y + 182, width, 262, palettes.lime, 38)}
    ${text(x + 38, y + 242, 'VALUEVISION PLUS', 23, palettes.black, 900, 'start', 'Arial, sans-serif', 2)}
    ${text(x + 38, y + 325, '&#163;9.99 / month', 56, palettes.black, 900, 'start', 'Georgia, serif')}
    ${text(x + 38, y + 386, '100 Value Credits every 30 days', 29, palettes.black, 700)}
    ${text(x, y + 500, 'CREDIT TOP-UPS', 23, palettes.muted, 800, 'start', 'Arial, sans-serif', 2)}
    ${statusRow(x, y + 530, width, '25 Value Credits', '&#163;3.99', palettes.lime)}
    ${statusRow(x, y + 634, width, '75 Value Credits', '&#163;8.99', palettes.mint)}
    ${rounded(x, y + 760, width, 244, palettes.panel, 36, palettes.line, 2)}
    ${text(x + 34, y + 816, 'HOW CREDITS WORK', 22, palettes.coral, 800, 'start', 'Arial, sans-serif', 2)}
    ${wrapText(x + 34, y + 872, ['Item and Treasure Hunt valuations use 1 credit.', 'A basic car valuation uses 3 credits.'], 28, 42, palettes.ink, 600)}
    ${text(x + 34, y + 966, 'Full Car Checks are separate: &#163;4.50 each.', 27, palettes.muted, 700)}
  `;
}

function contentFor(kind, x, y, width) {
  if (kind === 'home') return homeContent(x, y, width);
  if (kind === 'item') return itemContent(x, y, width);
  if (kind === 'car') return carContent(x, y, width);
  if (kind === 'check') return checkContent(x, y, width);
  if (kind === 'treasure') return treasureContent(x, y, width);
  return pricingContent(x, y, width);
}

function makeSvg(screen, width, height, device) {
  const isTablet = device === 'ipad';
  const margin = isTablet ? 150 : 74;
  const contentWidth = isTablet ? 1210 : width - (margin * 2);
  const contentX = isTablet ? width - margin - contentWidth : margin;
  const titleX = margin;
  const titleY = isTablet ? 470 : 485;
  const contentY = isTablet ? 840 : 970;
  const titleSize = isTablet ? 106 : 93;
  const introSize = isTablet ? 35 : 31;
  const introWidth = isTablet ? 760 : 1080;
  const introLines = wrapWords(screen.intro, isTablet ? 44 : 38);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${palettes.bg}"/>
    <circle cx="${width * 0.9}" cy="${height * 0.08}" r="${width * 0.42}" fill="#0d2a20" opacity="0.9"/>
    <circle cx="${width * 0.08}" cy="${height * 0.92}" r="${width * 0.5}" fill="#0b2119" opacity="0.95"/>
    ${logo(margin, isTablet ? 95 : 90, isTablet ? 128 : 112)}
    ${text(margin + (isTablet ? 150 : 132), isTablet ? 170 : 158, 'VALUEVISION', isTablet ? 34 : 30, palettes.ink, 900, 'start', 'Arial, sans-serif', 5)}
    ${pill(width - margin - (isTablet ? 276 : 248), isTablet ? 108 : 105, isTablet ? 276 : 248, 'SEE THE VALUE', palettes.panelSoft, palettes.lime, isTablet ? 27 : 23)}
    ${text(titleX, titleY - 108, screen.kicker, isTablet ? 29 : 25, palettes.lime, 800, 'start', 'Arial, sans-serif', 4)}
    ${wrapText(titleX, titleY, screen.title, titleSize, titleSize * 1.03, palettes.ink, 700, 'Georgia, serif')}
    ${wrapText(titleX, titleY + (titleSize * 2.45), introLines, introSize, introSize * 1.42, palettes.muted, 500)}
    ${isTablet ? `${rounded(contentX - 44, contentY - 44, contentWidth + 88, 1170, '#0a2118', 54, palettes.line, 2)}` : ''}
    ${contentFor(screen.kind, contentX, contentY, contentWidth)}
    ${text(margin, height - 72, 'Values are estimates. Vehicle results depend on available provider data.', isTablet ? 24 : 21, '#73867c', 500)}
  </svg>`;
}

function wrapWords(value, maxLength) {
  const words = value.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

fs.mkdirSync(svgRoot, { recursive: true });
fs.mkdirSync(path.join(root, 'APP_IPHONE_65'), { recursive: true });
fs.mkdirSync(path.join(root, 'APP_IPAD_PRO_3GEN_129'), { recursive: true });
fs.mkdirSync(metadataRoot, { recursive: true });

for (const screen of screens) {
  fs.writeFileSync(path.join(svgRoot, `iphone_${screen.file}.svg`), makeSvg(screen, 1284, 2778, 'iphone'));
  fs.writeFileSync(path.join(svgRoot, `ipad_${screen.file}.svg`), makeSvg(screen, 2048, 2732, 'ipad'));
}

const launchCopy = `VALUEVISION APP STORE LAUNCH COPY

Subtitle
Scan Anything. Know Its Value

Promotional text
Scan an item, check a vehicle or discover promising finds in a room with evidence-led values and clear confidence guidance.

What's New
A complete ValueVision redesign with clearer item valuations, dedicated Car Mode, mileage-discrepancy reporting, Treasure Hunt room scanning, stronger market-evidence filtering and Value Credits.

Launch price sheet
- Free download: 3 starter Value Credits
- ValueVision Plus: £9.99 per month, including 100 Value Credits every 30 days
- 25-credit top-up: £3.99
- 75-credit top-up: £8.99
- Item valuation: 1 credit
- Treasure Hunt item: 1 credit
- Basic car valuation: 3 credits
- Full Car Check: £4.50
- Three Full Car Checks: £11.99

Important customer wording
- Values are estimates, not guaranteed sale prices or formal appraisals.
- Full Car Check results depend on available provider records.
- Treasure Hunt ranks visible finds worth closer inspection; close-up photos improve identification.
`;

fs.writeFileSync(path.join(metadataRoot, 'launch-copy.txt'), launchCopy);
console.log(`Generated ${screens.length * 2} launch SVGs and launch-copy.txt`);
