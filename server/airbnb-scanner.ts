import { chromium, Browser, Page } from "playwright";
import type { WhereYoullSleep, HostProfileData } from "@shared/schema";
import { logger } from "./logger";
import { is } from "drizzle-orm";

export interface AirbnbScanResult {
  success: boolean;
  errorMessage?: string;
  whereYoullSleep?: WhereYoullSleep;
  hasWhereYoullSleep: boolean;
  isSuperhost: boolean;
  guestFavoriteTier: "gold" | "black" | "standard" | null;
  hostProfile?: HostProfileData;
  rawSnapshot?: Record<string, unknown>;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920,1080",
      ],
    });
  }
  return browserInstance;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// async function extractWhereYoullSleep(
//   page: Page,
// ): Promise<{ data?: WhereYoullSleep; hasSection: boolean }> {
//   try {
//     logger.info("AirbnbScanner", "Looking for sleeping arrangement section...");
//     const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
//     const isBedText = (s: string) =>
//       /(king|queen|double|single|sofa\s*bed|sofa|couch|futon|bunk|bed)/i.test(
//         s,
//       );
//     const cleanBedConfig = (s: string) => {
//       let out = normalize(s)
//         .replace(/^Bedroom\s*\d+/i, "")
//         .replace(/^Living room/i, "")
//         .trim();
//       if (!isBedText(out)) return "";
//       return out;
//     };

//     // Keep names unique and preserve first room image when available.
//     const roomByName = new Map<
//       string,
//       { name: string; bedConfiguration: string; photoUrl?: string }
//     >();
//     const upsertRoom = (nameRaw: string, bedRaw: string, photoUrl?: string) => {
//       const name = normalize(nameRaw || "Room");
//       if (!name) return;
//       const bedConfiguration = cleanBedConfig(bedRaw || "");
//       const existing = roomByName.get(name);
//       if (!existing) {
//         roomByName.set(name, { name, bedConfiguration, photoUrl });
//         return;
//       }
//       if (!existing.bedConfiguration && bedConfiguration)
//         existing.bedConfiguration = bedConfiguration;
//       if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
//     };

//     // First look for explicit sleep section containers.
//     let sleepSection = await page.$(
//       [
//         'section[role="region"][aria-labelledby="sleeping-arrangements-title"]',
//         'div[data-plugin-in-point-id="SLEEPING_ARRANGEMENT_DEFAULT"]',
//       ].join(", "),
//     );

//     logger.info(
//       "AirbnbScanner",
//       "Sleeping arrangement section detected, extracting rooms...",
//     );
//     // 1) Structured extraction from section card UI.
//     if (sleepSection) {
//       const isDivSleepingSection =
//         (await sleepSection.getAttribute("data-section-id")) ===
//         "SLEEPING_ARRANGEMENT_DEFAULT";

//       if (isDivSleepingSection) {
//         // No-image layout: each room name lives in a childless leaf div whose
//         // text exactly matches "Bedroom N" / "Living room", with bed config as
//         // the immediately following sibling div.
//         const extractedRooms = await sleepSection.evaluate(
//           (container: Element) => {
//             const results: Array<{ name: string; bedText: string }> = [];
//             const divs = container.querySelectorAll("div");
//             for (const div of Array.from(divs)) {
//               const text = (div.textContent || "").trim();
//               if (
//                 /^(Bedroom\s*\d+|Living room)$/i.test(text) &&
//                 div.childElementCount === 0
//               ) {
//                 const bedSibling = div.nextElementSibling;
//                 const bedText = (bedSibling?.textContent || "").trim();
//                 results.push({ name: text, bedText });
//               }
//             }
//             return results;
//           },
//         );

//         logger.info(
//           "AirbnbScanner",
//           `Found ${extractedRooms.length} rooms via div text extraction`,
//         );

//         for (const { name, bedText } of extractedRooms) {
//           upsertRoom(name, bedText);
//         }
//       } else {
//         // Image-carousel layout: each room is an li[data-key] card.
//         const roomCards = await sleepSection.$$("li[data-key]");
//         logger.info(
//           "AirbnbScanner",
//           `Found ${roomCards.length} structured room cards`,
//         );

//         for (const card of roomCards) {
//           try {
//             const keyName = normalize(
//               (await card.getAttribute("data-key")) || "",
//             );

//             let name = keyName;
//             if (!name) {
//               const nameEl = await card.$(
//                 '[aria-label*="Bedroom" i], [aria-label*="Living room" i], div',
//               );
//               name = normalize((await nameEl?.textContent()) || "");
//             }

//             let bedText = "";
//             const bedEl = await card.$(
//               '[aria-label*="bed" i], [aria-label*="sofa" i], p, span, div',
//             );
//             bedText = normalize((await bedEl?.textContent()) || "");

//             if (!isBedText(bedText)) {
//               const cardText = normalize((await card.textContent()) || "");
//               const bedMatch = cardText.match(
//                 /(\d+\s*(king|queen|double|single|sofa\s*bed|sofa|couch|futon|bunk)\s*(bed|beds)?)/i,
//               );
//               bedText = bedMatch ? normalize(bedMatch[0]) : "";
//             }

//             let photoUrl: string | undefined;
//             const imgEl = await card.$("img, picture img");
//             if (imgEl) {
//               photoUrl =
//                 (await imgEl.getAttribute("data-original-uri")) ||
//                 (await imgEl.getAttribute("src")) ||
//                 undefined;
//               if (!photoUrl) {
//                 const srcset = await imgEl.getAttribute("srcset");
//                 if (srcset) {
//                   const last = srcset
//                     .split(",")
//                     .map((s: string) => s.trim())
//                     .pop();
//                   photoUrl = last ? last.split(" ")[0] : undefined;
//                 }
//               }
//             }

//             if (!photoUrl) {
//               const sourceEl = await card.$("picture source[srcset]");
//               if (sourceEl) {
//                 const srcset = await sourceEl.getAttribute("srcset");
//                 if (srcset) {
//                   const last = srcset
//                     .split(",")
//                     .map((s: string) => s.trim())
//                     .pop();
//                   photoUrl = last ? last.split(" ")[0] : undefined;
//                 }
//               }
//             }

//             if (name) {
//               upsertRoom(name, bedText, photoUrl);
//             }
//           } catch (e) {
//             logger.info(
//               "AirbnbScanner",
//               "Error extracting structured room card:",
//               e,
//             );
//           }
//         }
//       }
//     }

//     const rooms = Array.from(roomByName.values());
//     logger.info("AirbnbScanner", `Extracted ${rooms.length} rooms total`);

//     return {
//       hasSection: true,
//       data: rooms.length > 0 ? { rooms } : undefined,
//     };
//   } catch (error) {
//     logger.error(
//       "AirbnbScanner",
//       "Error extracting Where You'll Sleep:",
//       error,
//     );
//     return { hasSection: false };
//   }
// }

async function extractWhereYoullSleep(
  page: Page,
): Promise<{ data?: WhereYoullSleep; hasSection: boolean }> {
  try {
<<<<<<< Updated upstream
    logger.info('AirbnbScanner', 'Looking for sleeping arrangement section...');

    // Scroll to the sleeping section to trigger lazy loading
    const scrolledToSection = await page.evaluate(async () => {
      const ids = ['SLEEPING_ARRANGEMENT_WITH_IMAGES', 'SLEEPING_ARRANGEMENT'];
      for (const id of ids) {
        const el = document.querySelector(`[data-section-id="${id}"]`);
        if (el) { (el as HTMLElement).scrollIntoView({ block: 'center' }); return true; }
      }
      // Text-based fallback scroll
      const allEls = document.querySelectorAll('section, div[data-section-id]');
      for (const el of allEls) {
        if (el.textContent?.includes("Where you'll sleep")) {
          (el as HTMLElement).scrollIntoView({ block: 'center' });
          return true;
        }
      }
      return false;
    });

    if (scrolledToSection) await delay(1500);

    // Use page.evaluate for reliable cross-version extraction
    const extractedRooms = await page.evaluate(() => {
      const sectionIds = ['SLEEPING_ARRANGEMENT_WITH_IMAGES', 'SLEEPING_ARRANGEMENT'];
      let section: Element | null = null;

      for (const id of sectionIds) {
        section = document.querySelector(`[data-section-id="${id}"]`);
        if (section) break;
      }

      if (!section) {
        // Text-based section search
        const candidates = document.querySelectorAll('section, div[data-section-id], div[id]');
        for (const el of candidates) {
          if (el.textContent?.includes("Where you'll sleep")) {
            section = el;
            break;
          }
        }
      }

      if (!section) return null;

      const result: Array<{ name: string; bedConfiguration: string; photoUrl?: string }> = [];

      // Strategy 1: card elements with aria-labels or test ids
      const cardSelectors = [
        '[data-testid="pdp-sleeping-arrangement-card"]',
        '[aria-label*="Bedroom"]',
        '[aria-label*="bedroom"]',
      ];
      for (const sel of cardSelectors) {
        const cards = section.querySelectorAll(sel);
        if (cards.length > 0) {
          cards.forEach(card => {
            const nameEl = card.querySelector('h3, h4, [class*="title"]');
            const name = nameEl?.textContent?.trim() || '';
            const bedEl = card.querySelector('p, [class*="subtitle"]');
            const bedConfig = bedEl?.textContent?.trim() || '';
            const img = card.querySelector('img');
            const photoUrl = img?.getAttribute('src') || undefined;
            if (name) result.push({ name, bedConfiguration: bedConfig, photoUrl });
          });
          if (result.length > 0) return result;
        }
      }

      // Strategy 2: text-content parsing (Airbnb concatenates room + bed text)
      const text = section.textContent || '';
      const parts = text.split(/(?=Bedroom\s+\d+|Living\s+room|Studio)/i).filter(p => p.trim().length > 2);
      const imgs = Array.from(section.querySelectorAll('img'));

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        const bedroomMatch = part.match(/^Bedroom\s*(\d+)/i);
        const livingMatch = part.match(/^Living\s+room/i);
        const studioMatch = part.match(/^Studio/i);

        let name = '';
        let bedConfig = '';

        if (bedroomMatch) {
          name = `Bedroom ${bedroomMatch[1]}`;
          bedConfig = part.replace(/^Bedroom\s*\d+\s*/i, '').trim();
        } else if (livingMatch) {
          name = 'Living room';
          bedConfig = part.replace(/^Living\s+room\s*/i, '').trim();
        } else if (studioMatch) {
          name = 'Studio';
          bedConfig = part.replace(/^Studio\s*/i, '').trim();
        } else {
          continue;
        }

        // Trim anything that looks like the next room's name bleeding in
        bedConfig = bedConfig.replace(/\s*(Bedroom\s+\d+|Living\s+room|Studio).*$/i, '').trim();

        const photoUrl = imgs[i]?.getAttribute('src') || undefined;
        result.push({ name, bedConfiguration: bedConfig, photoUrl });
=======
    logger.info("AirbnbScanner", "Looking for sleeping arrangement section...");
 
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
 
    const BED_PATTERN =
      /(king|queen|double|single|sofa\s*bed|sofa|couch|futon|bunk|bed)/i;
 
    const isBedText = (s: string) => BED_PATTERN.test(s);
 
    /** Extract all bed descriptions from a card's full text */
    const extractAllBeds = (cardText: string): string => {
      // Match patterns like "1 king bed", "2 single beds", "1 sofa bed"
      const matches = [
        ...cardText.matchAll(
          /\d+\s*(king|queen|double|single|sofa\s*bed|sofa|couch|futon|bunk)\s*(bed|beds)?/gi,
        ),
      ];
      if (matches.length > 0) {
        return matches.map((m) => normalize(m[0])).join(", ");
      }
      // Fallback: grab any sentence containing a bed keyword
      const sentence = cardText
        .split(/[·•\n]/)
        .map(normalize)
        .find(isBedText);
      return sentence || "";
    };
 
    /** Pick highest-resolution URL from a srcset string */
    const bestFromSrcset = (srcset: string): string | undefined => {
      const entries = srcset
        .split(",")
        .map((entry) => {
          const [url, descriptor = "1w"] = entry.trim().split(/\s+/);
          const width = parseInt(descriptor) || 1;
          return { url, width };
        })
        .sort((a, b) => b.width - a.width);
      return entries[0]?.url;
    };
 
    const extractImageFromCard = async (
      card: ElementHandle,
    ): Promise<string | undefined> => {
      // Priority 1: data-original-uri (full quality Airbnb image)
      const img = await card.$("img");
      if (img) {
        const originalUri = await img.getAttribute("data-original-uri");
        if (originalUri) return originalUri;
 
        // Priority 2: highest res from srcset
        const srcset =
          (await img.getAttribute("srcset")) ||
          (await card.$eval(
            "picture source[srcset]",
            (el) => el.getAttribute("srcset") || "",
          ).catch(() => ""));
        if (srcset) {
          const best = bestFromSrcset(srcset);
          if (best) return best;
        }
 
        // Priority 3: src (last resort — often low-res placeholder)
        const src = await img.getAttribute("src");
        if (src && !src.startsWith("data:")) return src;
      }
 
      // Also check <picture> sources directly
      const sourceEl = await card.$("picture source[srcset]");
      if (sourceEl) {
        const srcset = await sourceEl.getAttribute("srcset");
        if (srcset) return bestFromSrcset(srcset);
      }
 
      return undefined;
    };
 
    // Keep names unique, preserve first room image when available
    const roomByName = new Map
      string,
      { name: string; bedConfiguration: string; photoUrl?: string }
>();
 
    const upsertRoom = (
      nameRaw: string,
      bedConfig: string,
      photoUrl?: string,
    ) => {
      const name = normalize(nameRaw || "Room");
      if (!name) return;
      const existing = roomByName.get(name);
      if (!existing) {
        roomByName.set(name, { name, bedConfiguration: bedConfig, photoUrl });
        return;
      }
      if (!existing.bedConfiguration && bedConfig)
        existing.bedConfiguration = bedConfig;
      if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
    };
 
    // ── Locate the sleep section ──────────────────────────────────────────────
    const sleepSection = await page.$(
      [
        'section[role="region"][aria-labelledby="sleeping-arrangements-title"]',
        'div[data-plugin-in-point-id="SLEEPING_ARRANGEMENT_DEFAULT"]',
        'div[data-section-id="SLEEPING_ARRANGEMENT_DEFAULT"]',
        // Fallback: any section whose heading mentions "sleep"
        'section:has(h2:text-matches("sleep", "i"))',
        'div:has(h2:text-matches("sleep", "i"))',
      ].join(", "),
    );
 
    if (!sleepSection) {
      logger.info("AirbnbScanner", "No sleeping arrangement section found.");
      return { hasSection: false };
    }
 
    logger.info(
      "AirbnbScanner",
      "Sleeping arrangement section detected, extracting rooms...",
    );
 
    // ── Try to expand hidden rooms (carousel / "Show all" button) ────────────
    try {
      const showAllBtn = await sleepSection.$(
        'button:text-matches("show all|see more|show more", "i")',
      );
      if (showAllBtn) {
        await showAllBtn.click();
        await page.waitForTimeout(600);
        logger.info("AirbnbScanner", "Expanded 'Show all' rooms button");
      }
    } catch (_) {
      /* non-fatal */
    }
 
    const sectionId = await sleepSection.getAttribute("data-section-id");
    const isDivSection = sectionId === "SLEEPING_ARRANGEMENT_DEFAULT";
 
    // ── Structured card extraction ────────────────────────────────────────────
    // Prefer specific selectors over generic "div"
    const CARD_SELECTORS = [
      "li[data-key]",           // classic list-item cards
      '[data-testid*="room"]',  // testid-based cards
      '[aria-label*="Bedroom" i]',
      '[aria-label*="Living room" i]',
      ...(isDivSection
        ? [
            // For the div-based section, grab only direct children
            // that look like cards (have an img or a heading inside)
            ":scope > div:has(img), :scope > div:has(h3)",
          ]
        : []),
    ];
 
    let roomCards: ElementHandle[] = [];
    for (const sel of CARD_SELECTORS) {
      try {
        const found = await sleepSection.$$(sel);
        if (found.length > 0) {
          roomCards = found;
          logger.info(
            "AirbnbScanner",
            `Matched ${found.length} cards with selector: "${sel}"`,
          );
          break;
        }
      } catch (_) {
        /* selector may not be supported in this Playwright version */
      }
    }
 
    logger.info(
      "AirbnbScanner",
      `Processing ${roomCards.length} room cards...`,
    );
 
    for (const card of roomCards) {
      try {
        // ── Room name ───────────────────────────────────────────────────────
        let name =
          normalize((await card.getAttribute("data-key")) || "") ||
          normalize(
            (await card.$eval(
              [
                "h2",
                "h3",
                "h4",
                '[aria-label*="Bedroom" i]',
                '[aria-label*="Living room" i]',
              ].join(", "),
              (el) => el.textContent || "",
            ).catch(() => "")),
          );
 
        // Strip leading "Bedroom N" / "Living room" prefix from full card text
        // only if we still have no usable name
        if (!name) {
          const cardText = normalize((await card.textContent()) || "");
          const roomMatch = cardText.match(
            /^(Bedroom\s*\d+|Living\s*room|Common\s*space)/i,
          );
          name = roomMatch ? roomMatch[0] : "";
        }
 
        if (!name) continue; // skip cards we can't identify
 
        // ── Bed configuration ───────────────────────────────────────────────
        const cardText = normalize((await card.textContent()) || "");
        const bedConfiguration = extractAllBeds(cardText);
 
        // ── Photo ───────────────────────────────────────────────────────────
        const photoUrl = await extractImageFromCard(card);
 
        upsertRoom(name, bedConfiguration, photoUrl);
      } catch (e) {
        logger.info("AirbnbScanner", "Error processing room card:", e);
>>>>>>> Stashed changes
      }

      return result.length > 0 ? result : null;
    });

    if (!extractedRooms || extractedRooms.length === 0) {
      logger.info('AirbnbScanner', 'No sleeping arrangement data extracted');
      return { hasSection: false };
    }
<<<<<<< Updated upstream

    logger.info('AirbnbScanner', `Extracted ${extractedRooms.length} rooms total`);
    return {
      hasSection: true,
      data: { rooms: extractedRooms },
=======
 
    // ── Fallback: plain-text parse if structured extraction yielded nothing ──
    if (roomByName.size === 0) {
      logger.info(
        "AirbnbScanner",
        "Structured extraction empty — falling back to text parse",
      );
      const sectionText = normalize((await sleepSection.textContent()) || "");
      const segments = sectionText.split(
        /(?=Bedroom\s*\d+|Living\s*room|Common\s*space)/i,
      );
      for (const seg of segments) {
        const nameMatch = seg.match(
          /^(Bedroom\s*\d+|Living\s*room|Common\s*space)/i,
        );
        if (!nameMatch) continue;
        const bedConfiguration = extractAllBeds(seg);
        upsertRoom(nameMatch[0], bedConfiguration);
      }
    }
 
    const rooms = Array.from(roomByName.values());
    logger.info("AirbnbScanner", `Extracted ${rooms.length} rooms total`);
 
    return {
      hasSection: true,
      data: rooms.length > 0 ? { rooms } : undefined,
>>>>>>> Stashed changes
    };
  } catch (error) {
    logger.error(
      "AirbnbScanner",
      "Error extracting Where You'll Sleep:",
      error,
    );
    return { hasSection: false };
  }
}

async function extractSuperHostStatus(page: Page): Promise<boolean> {
  try {
    const superhostBadge = await page.$(
      'span:has-text("Superhost"), [aria-label*="Superhost"], svg[aria-label*="Superhost"]',
    );
    if (superhostBadge) return true;

    const pageText = await page.textContent("body");
    if (pageText && pageText.includes("Superhost")) {
      const hostSection = await page.$(
        'section:has-text("Hosted by"), [data-section-id="HOST_PROFILE"]',
      );
      if (hostSection) {
        const hostText = await hostSection.textContent();
        if (hostText && hostText.includes("Superhost")) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    logger.error("AirbnbScanner", "Error extracting Superhost status:", error);
    return false;
  }
}

async function extractGuestFavoriteTier(
  page: Page,
): Promise<"gold" | "black" | "standard" | null> {
  try {
    const goldBanner = await page.$(
      '[class*="gold"], [style*="gold"], div:has-text("Guest favorite"):has([style*="background"]):has([style*="#"]), [data-testid="guest-favorite-badge-gold"]',
    );
    if (goldBanner) {
      const style = await goldBanner.getAttribute("style");
      const className = await goldBanner.getAttribute("class");
      if (
        (style && style.includes("gold")) ||
        (className && className.includes("gold"))
      ) {
        return "gold";
      }
    }

    const guestFavoriteBadge = await page.$(
      'div:has-text("Guest favorite"), [aria-label*="Guest favorite"], [data-testid*="guest-favorite"]',
    );
    if (guestFavoriteBadge) {
      const badgeText = await guestFavoriteBadge.textContent();
      const parentStyle = await guestFavoriteBadge.evaluate((el) => {
        const parent = el.closest("div[class]");
        return parent ? window.getComputedStyle(parent).backgroundColor : "";
      });

      if (parentStyle && parentStyle.includes("rgb(0, 0, 0)")) {
        return "black";
      }

      if (badgeText) {
        if (
          badgeText.toLowerCase().includes("1%") ||
          badgeText.toLowerCase().includes("top 1")
        ) {
          return "gold";
        }
        if (
          badgeText.toLowerCase().includes("5%") ||
          badgeText.toLowerCase().includes("top 5")
        ) {
          return "black";
        }
        return "standard";
      }
    }

    const pageContent = await page.content();
    if (pageContent.includes("Guest favorite")) {
      return "standard";
    }

    return null;
  } catch (error) {
    logger.error(
      "AirbnbScanner",
      "Error extracting Guest Favorite tier:",
      error,
    );
    return null;
  }
}

async function extractHostProfile(
  page: Page,
): Promise<HostProfileData | undefined> {
  try {
    // Use updated Airbnb selector for host overview section
    const hostSection = await page.$(
      '[data-section-id="HOST_OVERVIEW_DEFAULT"], [data-section-id="HOST_PROFILE"], section:has-text("Hosted by")',
    );
    if (!hostSection) {
      return undefined;
    }

    let hostName = "";
    // Extract host name from section text - pattern: "Hosted by NameSuperhost" or "Hosted by Name"
    const sectionText = (await hostSection.textContent()) || "";
    // Match "Hosted by Name" but stop before "Superhost" if present
    const hostMatch = sectionText.match(
      /Hosted by\s+([A-Za-z]+?)(?:Superhost|$|\s|·)/i,
    );
    if (hostMatch) {
      hostName = hostMatch[1].replace(/Superhost$/i, "").trim();
    } else {
      const nameEl = await hostSection.$(
        'h2, [class*="host"] span, a[href*="/users/show/"] span',
      );
      if (nameEl) {
        const nameText = await nameEl.textContent();
        hostName =
          nameText
            ?.replace("Hosted by", "")
            .replace(/Superhost/i, "")
            .trim() || "";
      }
    }

    let photoUrl: string | undefined;
    // Try multiple selectors for host photo - Airbnb uses various patterns
    const photoSelectors = [
      'img[src*="profile"]',
      'img[alt*="host"]',
      "picture img",
      'img[src*="avatars"]',
      'img[src*="users"]',
      '[data-testid="host-avatar"] img',
      'a[href*="/users/show/"] img',
      'div[style*="background-image"]',
    ];

    for (const selector of photoSelectors) {
      if (photoUrl) break;
      const photoEl = await hostSection.$(selector);
      if (photoEl) {
        if (selector.includes("background-image")) {
          // Extract background-image URL
          const style = await photoEl.getAttribute("style");
          const urlMatch = style?.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            photoUrl = urlMatch[1];
          }
        } else {
          photoUrl = (await photoEl.getAttribute("src")) || undefined;
        }
      }
    }

    // If still no photo from host section, try the modal later
    logger.info(
      "AirbnbScanner",
      `Host photo from section: ${photoUrl ? "Found" : "Not found"}`,
    );

    const isSuperhost =
      sectionText.includes("Superhost") || (await extractSuperHostStatus(page));

    let responseRate: string | undefined;
    let responseTime: string | undefined;
    let yearsHosting: number | undefined;
    let reviewCount: number | undefined;
    let rating: number | undefined;
    let verified = false;
    const attributes: string[] = [];
    let aboutText: string | undefined;

    // First try to extract from the section text directly (faster)
    const yearsMatch = sectionText.match(/(\d+)\s*years?\s*hosting/i);
    if (yearsMatch) {
      yearsHosting = parseInt(yearsMatch[1]);
    }

    const statElements = await hostSection.$$("span, div");
    for (const stat of statElements) {
      const text = await stat.textContent();
      if (!text) continue;

      if (text.includes("Response rate")) {
        const match = text.match(/(\d+)%/);
        if (match) responseRate = match[1] + "%";
      }
      if (text.includes("Response time") || text.includes("responds")) {
        responseTime = text.replace("Response time:", "").trim();
      }
      if (!yearsHosting && text.includes("year") && text.includes("hosting")) {
        const match = text.match(/(\d+)/);
        if (match) yearsHosting = parseInt(match[1]);
      }
      if (text.includes("Review") || text.includes("review")) {
        const match = text.match(/(\d+)/);
        if (match) reviewCount = parseInt(match[1]);
      }
      if (text.includes("Identity verified") || text.includes("Verified")) {
        verified = true;
      }
    }

    // Click on host section to open the modal with more details
    try {
      logger.info("AirbnbScanner", "Clicking host section to open modal...");

      // Scroll to the host section first
      await hostSection.scrollIntoViewIfNeeded();
      await delay(500);

      // Click on the host section to open the modal
      await hostSection.click({ timeout: 5000 });
      await delay(2000);

      // Look for the "Meet your host" modal or profile section
      const modalContent = await page.$(
        'section:has-text("Meet your host"), div[role="dialog"], [data-testid="modal-container"]',
      );

      if (modalContent) {
        logger.info(
          "AirbnbScanner",
          "Modal opened, extracting host details...",
        );

        // If we didn't find host photo in the section, try inside the modal
        if (!photoUrl) {
          const modalPhotoSelectors = [
            'img[src*="profile"]',
            'img[src*="avatars"]',
            'img[src*="users"]',
            'img[alt*="host"]',
            "picture img",
            '[data-testid="host-avatar"] img',
            'a[href*="/users/show/"] img',
            'div[style*="background-image"] img',
            "img",
          ];
          for (const sel of modalPhotoSelectors) {
            const imgEl = await modalContent.$(sel);
            if (imgEl) {
              const src = await imgEl.getAttribute("src");
              if (
                src &&
                !src.includes("logo") &&
                !src.includes("icon") &&
                (src.includes("profile") ||
                  src.includes("avatar") ||
                  src.includes("user") ||
                  src.length > 50)
              ) {
                photoUrl = src;
                logger.info("AirbnbScanner", "Host photo found in modal");
                break;
              }
              const style = await imgEl.getAttribute("style");
              if (style && style.includes("background-image")) {
                const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch) {
                  photoUrl = urlMatch[1];
                  logger.info(
                    "AirbnbScanner",
                    "Host photo found in modal (background-image)",
                  );
                  break;
                }
              }
            }
            if (photoUrl) break;
          }
          if (!photoUrl) {
            const modalImgs = await modalContent.$$("img");
            for (const img of modalImgs) {
              const src = await img.getAttribute("src");
              if (
                src &&
                src.startsWith("http") &&
                !src.includes("logo") &&
                !src.includes("airbnb") &&
                (src.includes("profile") ||
                  src.includes("avatar") ||
                  src.includes("cloudfront") ||
                  src.includes("amazonaws"))
              ) {
                photoUrl = src;
                logger.info(
                  "AirbnbScanner",
                  "Host photo found in modal (fallback img)",
                );
                break;
              }
            }
          }
        }

        // Extract reviews count and rating from modal
        const modalText = (await modalContent.textContent()) || "";

        const reviewsMatch = modalText.match(/(\d+)\s*Reviews?/i);
        if (reviewsMatch) {
          reviewCount = parseInt(reviewsMatch[1]);
        }

        const ratingMatch = modalText.match(/(\d+\.?\d*)\s*★?\s*Rating/i);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }

        // Extract response rate and time from modal
        const respRateMatch = modalText.match(/Response rate:\s*(\d+)%/i);
        if (respRateMatch) {
          responseRate = respRateMatch[1] + "%";
        }

        const respTimeMatch = modalText.match(
          /Responds?\s*(within\s+(?:an?\s+)?\w+)/i,
        );
        if (respTimeMatch) {
          // Clean up the response time string
          responseTime = respTimeMatch[1].replace(/Message.*$/i, "").trim();
        }

        // Extract attributes - use a general lookahead for common terminators
        // The modal text has concatenated content, so we look for the next label or bio text
        const terminator =
          "(?=Born|Where|My work|Fun fact|For guests|I spend|Favorite|Most useless|My biography|Lives in|What's for|Identity|Living in|I work in|I'm an|I also|Derek|\\d+ reviews|$)";

        const attrDefs = [
          {
            label: "My work",
            pattern: new RegExp("My work:\\s*(.{3,60}?)" + terminator, "i"),
          },
          {
            label: "Fun fact",
            pattern: new RegExp("Fun fact:\\s*(.{3,80}?)" + terminator, "i"),
          },
          {
            label: "School",
            pattern: new RegExp(
              "Where I went to school:\\s*(.{3,60}?)" + terminator,
              "i",
            ),
          },
          {
            label: "For guests",
            pattern: new RegExp(
              "For guests, I always:\\s*(.{3,80}?)" + terminator,
              "i",
            ),
          },
          {
            label: "Born",
            pattern: new RegExp("Born in the\\s*(.{2,20}?)" + terminator, "i"),
          },
          {
            label: "Spends time",
            pattern: new RegExp(
              "I spend too much time:\\s*(.{3,60}?)" + terminator,
              "i",
            ),
          },
          {
            label: "Favorite song",
            pattern: new RegExp(
              "Favorite song[^:]*:\\s*(.{3,60}?)" + terminator,
              "i",
            ),
          },
          {
            label: "Useless skill",
            pattern: new RegExp(
              "Most useless skill:\\s*(.{3,80}?)" + terminator,
              "i",
            ),
          },
          {
            label: "Biography title",
            pattern: new RegExp(
              "My biography title:\\s*(.{3,80}?)" + terminator,
              "i",
            ),
          },
          {
            label: "Lives in",
            pattern: new RegExp("Lives in\\s*(.{3,40}?)" + terminator, "i"),
          },
          {
            label: "Breakfast",
            pattern: new RegExp(
              "What's for breakfast:\\s*(.{3,60}?)" + terminator,
              "i",
            ),
          },
        ];

        for (const def of attrDefs) {
          const match = modalText.match(def.pattern);
          if (match) {
            attributes.push(`${def.label}: ${match[1].trim()}`);
          }
        }

        // Check for verified status
        if (modalText.includes("Identity verified")) {
          verified = true;
        }

        // Extract bio from the modal text - look for paragraph content after attributes
        // Bio typically starts with "Living in..." and ends before "Derek is a Superhost"
        const bioSection = modalText.match(
          /Living in[\s\S]+?(?=Derek is a Superhost|Host details|Response rate|Message host|$)/i,
        );
        if (bioSection) {
          let bio = bioSection[0].trim();
          // Clean up - remove trailing fragments
          bio = bio.replace(/Derek is a Superhost[\s\S]*$/i, "").trim();
          if (bio.length > 50) {
            aboutText = bio;
          }
        }

        // Try to navigate to the full host profile page for all attributes
        try {
          // Find the host profile link in the Meet your host section specifically
          // First try within the modal content, then fall back to page-wide search
          let hostLink = await modalContent.$(
            'a[aria-label="Go to Host full profile"]',
          );
          if (!hostLink) {
            hostLink = await modalContent.$('a[href*="/users/profile/"]');
          }
          if (!hostLink) {
            // Fall back to page-wide search but be more specific
            hostLink = await page.$(
              'section:has-text("Meet your host") a[href*="/users/profile/"]',
            );
          }
          if (hostLink) {
            const href = await hostLink.getAttribute("href");
            if (href) {
              // Navigate directly to avoid click interception issues
              const profileUrl = href.startsWith("http")
                ? href
                : "https://www.airbnb.com" + href;
              logger.info(
                "AirbnbScanner",
                "Navigating to host profile:",
                profileUrl,
              );
              await page.goto(profileUrl, {
                waitUntil: "domcontentloaded",
                timeout: 20000,
              });
              await delay(3000);

              // Scroll to About section which contains Show all
              await page.evaluate(() => window.scrollTo(0, 300));
              await delay(1000);

              // Wait for and click Show all button in the profile page (About section)
              try {
                const showAllBtn = await page.waitForSelector(
                  'button:has-text("Show all")',
                  { timeout: 5000 },
                );
                if (showAllBtn) {
                  logger.info(
                    "AirbnbScanner",
                    "Clicking Show all for more attributes...",
                  );
                  await showAllBtn.click({ timeout: 5000 });
                  await delay(2500);
                }
              } catch {
                logger.info(
                  "AirbnbScanner",
                  "No Show all button on profile page",
                );
              }

              // Extract from the full profile view
              const profileText = (await page.textContent("body")) || "";

              // Re-extract attributes from full profile - this has all the expanded content
              for (const def of attrDefs) {
                const match = profileText.match(def.pattern);
                if (match) {
                  const attr = `${def.label}: ${match[1].trim()}`;
                  if (!attributes.some((a) => a.startsWith(def.label))) {
                    attributes.push(attr);
                  }
                }
              }

              // Check for verified
              if (profileText.includes("Identity verified")) {
                verified = true;
              }

              // Also extract bio from profile page if not found yet
              if (!aboutText) {
                const bioProfMatch = profileText.match(
                  /Living in[\s\S]+?(?=Derek's reviews|Show more reviews|Where you'll be|\d+ listings|$)/i,
                );
                if (bioProfMatch) {
                  let bio = bioProfMatch[0].trim();
                  bio = bio.replace(/Derek's reviews[\s\S]*$/i, "").trim();
                  if (bio.length > 50 && bio.length < 1500) {
                    aboutText = bio;
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.info("AirbnbScanner", "Could not access full host profile");
        }

        // Close the modal by pressing Escape or clicking close button
        try {
          const closeButton = await page.$(
            'button[aria-label="Close"], [data-testid="modal-close-button"]',
          );
          if (closeButton) {
            await closeButton.click({ timeout: 2000 });
          } else {
            await page.keyboard.press("Escape");
          }
          await delay(500);
        } catch {
          // Modal might have closed automatically
        }
      }
    } catch (e) {
      logger.info(
        "AirbnbScanner",
        "Could not open host modal, using basic data",
      );
    }

    return {
      name: hostName,
      photoUrl,
      isSuperhost,
      responseRate,
      responseTime,
      yearsHosting,
      reviewCount,
      rating,
      verified,
      aboutText,
      attributes: Array.from(new Set(attributes)).slice(0, 20),
    };
  } catch (error) {
    logger.error("AirbnbScanner", "Error extracting Host Profile:", error);
    return undefined;
  }
}

export async function scanAirbnbListing(
  airbnbUrl: string,
): Promise<AirbnbScanResult> {
  let page: Page | null = null;

  try {
    logger.info("AirbnbScanner", `Starting scan for: ${airbnbUrl}`);

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    logger.info("AirbnbScanner", "Navigating to page...");
    await page.goto(airbnbUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await delay(3000);

    // Close any modals that might be blocking (with short timeout)
    try {
      const closeModalButton = await page.$(
        'button[aria-label="Close"], [data-testid="modal-close-button"]',
      );
      if (closeModalButton) {
        await closeModalButton.click({ timeout: 3000 });
        await delay(500);
      }
    } catch {
      // Modal close button may not be visible, continue anyway
    }

    // Scroll down the page to trigger lazy loading of all sections
    logger.info("AirbnbScanner", "Scrolling to load lazy content...");
    await page.evaluate(async () => {
      const scrollStep = 500;
      const maxScroll = document.body.scrollHeight;
      for (let scrollPos = 0; scrollPos < maxScroll; scrollPos += scrollStep) {
        window.scrollTo(0, scrollPos);
        await new Promise((r) => setTimeout(r, 200));
      }
      // Scroll back to top
      window.scrollTo(0, 0);
    });

    await delay(2000); // Wait for content to render after scrolling

    logger.info("AirbnbScanner", "Extracting data...");

<<<<<<< Updated upstream
    // Run non-navigating extractions in parallel first
    const [sleepResult, isSuperhost, guestFavoriteTier] = await Promise.all([
      extractWhereYoullSleep(page),
      extractSuperHostStatus(page),
      extractGuestFavoriteTier(page),
    ]);
=======
    const [sleepResult, isSuperhost, guestFavoriteTier, hostProfile] =
      await Promise.all([
        extractWhereYoullSleep(page),
        extractSuperHostStatus(page),
        extractGuestFavoriteTier(page),
        extractHostProfile(page),
      ]);
>>>>>>> Stashed changes

    // Run host profile LAST — it may call page.goto() to navigate to the host profile page,
    // which would destroy the context of any concurrent extractor still running on the listing page.
    const hostProfile = await extractHostProfile(page);

    const rawSnapshot = {
      url: airbnbUrl,
      scannedAt: new Date().toISOString(),
      pageTitle: await page.title(),
    };

    logger.info("AirbnbScanner", "Scan complete. Results:", {
      hasWhereYoullSleep: sleepResult.hasSection,
      roomCount: sleepResult.data?.rooms.length || 0,
      isSuperhost,
      guestFavoriteTier,
      hasHostProfile: !!hostProfile,
    });

    return {
      success: true,
      whereYoullSleep: sleepResult.data,
      hasWhereYoullSleep: sleepResult.hasSection,
      isSuperhost,
      guestFavoriteTier,
      hostProfile,
      rawSnapshot,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error("AirbnbScanner", "Error during scan:", error);

    // Helpful message when Chromium is missing (common in production if postbuild didn't run)
    const isBrowserMissing =
      /executable doesn't exist|Failed to launch|browserType\.launch|Could not find browser/i.test(
        rawMessage,
      );
    const errorMessage = isBrowserMissing
      ? 'Browser (Chromium) is not installed. Ensure the deployment build runs "npx playwright install chromium" (e.g. via postbuild).'
      : rawMessage;

    return {
      success: false,
      errorMessage,
      hasWhereYoullSleep: false,
      isSuperhost: false,
      guestFavoriteTier: null,
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

export async function scanAirbnbWhereYoullSleep(airbnbUrl: string): Promise<{
  success: boolean;
  errorMessage?: string;
  whereYoullSleep?: WhereYoullSleep;
  hasWhereYoullSleep: boolean;
  rawSnapshot?: Record<string, unknown>;
}> {
  let page: Page | null = null;

  try {
    logger.info(
      "AirbnbScanner",
      `Starting Where You'll Sleep test scan for: ${airbnbUrl}`,
    );

    const browser = await getBrowser();
    page = await browser.newPage();

    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    });

    await page.goto(airbnbUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await delay(3000);

    try {
      const closeModalButton = await page.$(
        'button[aria-label="Close"], [data-testid="modal-close-button"]',
      );
      if (closeModalButton) {
        await closeModalButton.click({ timeout: 3000 });
        await delay(500);
      }
    } catch {
      // Ignore modal close failures in debug endpoint
    }

    await page.evaluate(async () => {
      const scrollStep = 500;
      const maxScroll = document.body.scrollHeight;
      for (let scrollPos = 0; scrollPos < maxScroll; scrollPos += scrollStep) {
        window.scrollTo(0, scrollPos);
        await new Promise((r) => setTimeout(r, 200));
      }
      window.scrollTo(0, 0);
    });

    await delay(2000);

    const sleepResult = await extractWhereYoullSleep(page);
    const rawSnapshot = {
      url: airbnbUrl,
      scannedAt: new Date().toISOString(),
      pageTitle: await page.title(),
      roomCount: sleepResult.data?.rooms.length || 0,
    };

    logger.info("AirbnbScanner", "Where You'll Sleep test scan complete", {
      hasWhereYoullSleep: sleepResult.hasSection,
      roomCount: sleepResult.data?.rooms.length || 0,
    });

    return {
      success: true,
      whereYoullSleep: sleepResult.data,
      hasWhereYoullSleep: sleepResult.hasSection,
      rawSnapshot,
    };
  } catch (error) {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    logger.error(
      "AirbnbScanner",
      "Error during Where You'll Sleep test scan:",
      error,
    );

    return {
      success: false,
      errorMessage: rawMessage,
      hasWhereYoullSleep: false,
    };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
