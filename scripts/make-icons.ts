/** Gera os ícones PNG (iPhone exige PNG) a partir de public/icons/icon.svg. Rodar só se o ícone mudar. */
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const svg = readFileSync("public/icons/icon.svg", "utf8");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();

async function render(size: number, file: string, inset = 0, square = false) {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - inset * 2;
  await page.setContent(
    `<body style="margin:0;background:${square ? "#0b5a8a" : "transparent"}">
       <div style="position:absolute;inset:${inset}px;width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  await page.screenshot({ path: `public/icons/${file}`, omitBackground: !square });
}

await render(180, "apple-touch-icon.png", 0, true); // o iOS arredonda sozinho; sem transparência
await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(512, "icon-maskable-512.png", 64, true); // área segura para ícones adaptativos do Android
await browser.close();
