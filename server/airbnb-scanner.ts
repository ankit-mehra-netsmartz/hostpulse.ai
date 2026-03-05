import { chromium, Browser, Page } from 'playwright';
import type { WhereYoullSleep, HostProfileData } from '@shared/schema';
import { logger } from './logger';

export interface AirbnbScanResult {
  success: boolean;
  errorMessage?: string;
  whereYoullSleep?: WhereYoullSleep;
  hasWhereYoullSleep: boolean;
  isSuperhost: boolean;
  guestFavoriteTier: 'gold' | 'black' | 'standard' | null;
  hostProfile?: HostProfileData;
  rawSnapshot?: Record<string, unknown>;
}

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
      ],
    });
  }
  return browserInstance;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractWhereYoullSleep(page: Page): Promise<{ data?: WhereYoullSleep; hasSection: boolean }> {
  try {
    logger.info('AirbnbScanner', 'Looking for sleeping arrangement section...');
    
    // Look for the sleeping arrangement section with updated Airbnb selectors
    let sleepSection = await page.$('[data-section-id="SLEEPING_ARRANGEMENT_WITH_IMAGES"], [data-section-id="SLEEPING_ARRANGEMENT"]');
    if (!sleepSection) {
      // Fallback to text-based search
      sleepSection = await page.$('section:has-text("Where you\'ll sleep")');
      if (!sleepSection) {
        logger.info('AirbnbScanner', 'No sleeping arrangement section found');
        return { hasSection: false };
      }
    }
    
    logger.info('AirbnbScanner', 'Found sleeping section, extracting rooms...');

    const rooms: WhereYoullSleep['rooms'] = [];
    
    // Enhanced selector patterns for room cards with image containers
    // Airbnb uses carousel containers for each bedroom with an image
    const roomCards = await page.$$(`
      [data-section-id="SLEEPING_ARRANGEMENT_WITH_IMAGES"] [role="group"] > div,
      [data-section-id="SLEEPING_ARRANGEMENT_WITH_IMAGES"] [data-testid*="carousel-item"],
      [data-testid="pdp-sleeping-arrangement-card"],
      div[aria-label*="Bedroom"],
      [data-section-id="SLEEPING_ARRANGEMENT_WITH_IMAGES"] button[aria-label*="Bedroom"]
    `.replace(/\s+/g, ' ').trim());
    
    logger.info('AirbnbScanner', `Found ${roomCards.length} room cards`);
    
    if (roomCards.length === 0) {
      // Try finding images directly within the sleeping section
      const images = await sleepSection.$$('img');
      logger.info('AirbnbScanner', `Found ${images.length} images in sleep section`);
      
      // Try extracting from section text content
      const sectionText = sleepSection ? await sleepSection.textContent() : '';
      // Airbnb text pattern: "Bedroom 11 king bedBedroom 24 queen beds" 
      // = "Bedroom 1" + "1 king bed", "Bedroom 2" + "4 queen beds"
      // Use lookahead to split on "Bedroom" or "Living room" 
      const roomParts = sectionText?.split(/(?=Bedroom|Living room)/i).filter(p => p.trim().length > 0) || [];
      
      for (let i = 0; i < roomParts.length; i++) {
        const part = roomParts[i];
        // Match "Bedroom X" or "Living room" followed by bed configuration
        const bedroomMatch = part.match(/^Bedroom\s*(\d)/i);
        const livingMatch = part.match(/^Living room/i);
        
        // Try to get corresponding image for this room
        let photoUrl: string | undefined = undefined;
        if (images.length > i) {
          try {
            // Get the src directly - Airbnb uses responsive images
            photoUrl = await images[i].getAttribute('src') || undefined;
            // Fallback to srcset if needed
            if (!photoUrl) {
              const srcset = await images[i].getAttribute('srcset');
              if (srcset) {
                // Get highest resolution from srcset
                const srcParts = srcset.split(',').map(s => s.trim());
                const lastSrc = srcParts[srcParts.length - 1];
                photoUrl = lastSrc.split(' ')[0];
              }
            }
          } catch {}
        }
        
        if (bedroomMatch) {
          const bedroomNum = bedroomMatch[1];
          // Everything after "Bedroom X" is the bed config (including count)
          const bedConfig = part.replace(/^Bedroom\s*\d\s*/i, '').trim();
          rooms.push({
            name: `Bedroom ${bedroomNum}`,
            bedConfiguration: bedConfig,
            photoUrl,
          });
        } else if (livingMatch) {
          const bedConfig = part.replace(/^Living room\s*/i, '').trim();
          rooms.push({
            name: 'Living room',
            bedConfiguration: bedConfig,
            photoUrl,
          });
        }
      }
    } else {
      for (const card of roomCards) {
        try {
          // Enhanced selectors for name extraction
          const nameEl = await card.$('h3, [class*="title"], div > span:first-child, button > div > span');
          const name = nameEl ? await nameEl.textContent() : 'Room';
          
          // Enhanced selectors for bed configuration
          const bedConfigEl = await card.$('p, [class*="subtitle"], div > div > span, button > div > div > span');
          const bedConfiguration = bedConfigEl ? await bedConfigEl.textContent() : '';
          
          // Enhanced image extraction - try multiple patterns
          let photoUrl: string | undefined = undefined;
          const imgEl = await card.$('img, picture img');
          if (imgEl) {
            photoUrl = await imgEl.getAttribute('src') || undefined;
            // Try srcset for higher resolution
            if (!photoUrl) {
              const srcset = await imgEl.getAttribute('srcset');
              if (srcset) {
                const srcParts = srcset.split(',').map(s => s.trim());
                const lastSrc = srcParts[srcParts.length - 1];
                photoUrl = lastSrc.split(' ')[0];
              }
            }
          }
          
          // Fallback: check parent for background image
          if (!photoUrl) {
            const bgStyle = await card.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.backgroundImage;
            });
            if (bgStyle && bgStyle !== 'none') {
              const urlMatch = bgStyle.match(/url\(["']?([^"')]+)["']?\)/);
              if (urlMatch) {
                photoUrl = urlMatch[1];
              }
            }
          }
          
          if (name) {
            rooms.push({
              name: name.trim(),
              bedConfiguration: bedConfiguration?.trim() || '',
              photoUrl: photoUrl || undefined,
            });
            logger.info('AirbnbScanner', `Extracted room: ${name.trim()}, has photo: ${!!photoUrl}`);
          }
        } catch (e) {
          logger.info('AirbnbScanner', 'Error extracting room card:', e);
          continue;
        }
      }
    }

    logger.info('AirbnbScanner', `Extracted ${rooms.length} rooms total`);
    return {
      hasSection: rooms.length > 0,
      data: rooms.length > 0 ? { rooms } : undefined,
    };
  } catch (error) {
    logger.error('AirbnbScanner', 'Error extracting Where You\'ll Sleep:', error);
    return { hasSection: false };
  }
}

async function extractSuperHostStatus(page: Page): Promise<boolean> {
  try {
    const superhostBadge = await page.$('span:has-text("Superhost"), [aria-label*="Superhost"], svg[aria-label*="Superhost"]');
    if (superhostBadge) return true;

    const pageText = await page.textContent('body');
    if (pageText && pageText.includes('Superhost')) {
      const hostSection = await page.$('section:has-text("Hosted by"), [data-section-id="HOST_PROFILE"]');
      if (hostSection) {
        const hostText = await hostSection.textContent();
        if (hostText && hostText.includes('Superhost')) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    logger.error('AirbnbScanner', 'Error extracting Superhost status:', error);
    return false;
  }
}

async function extractGuestFavoriteTier(page: Page): Promise<'gold' | 'black' | 'standard' | null> {
  try {
    const goldBanner = await page.$('[class*="gold"], [style*="gold"], div:has-text("Guest favorite"):has([style*="background"]):has([style*="#"]), [data-testid="guest-favorite-badge-gold"]');
    if (goldBanner) {
      const style = await goldBanner.getAttribute('style');
      const className = await goldBanner.getAttribute('class');
      if ((style && style.includes('gold')) || (className && className.includes('gold'))) {
        return 'gold';
      }
    }

    const guestFavoriteBadge = await page.$('div:has-text("Guest favorite"), [aria-label*="Guest favorite"], [data-testid*="guest-favorite"]');
    if (guestFavoriteBadge) {
      const badgeText = await guestFavoriteBadge.textContent();
      const parentStyle = await guestFavoriteBadge.evaluate(el => {
        const parent = el.closest('div[class]');
        return parent ? window.getComputedStyle(parent).backgroundColor : '';
      });
      
      if (parentStyle && parentStyle.includes('rgb(0, 0, 0)')) {
        return 'black';
      }
      
      if (badgeText) {
        if (badgeText.toLowerCase().includes('1%') || badgeText.toLowerCase().includes('top 1')) {
          return 'gold';
        }
        if (badgeText.toLowerCase().includes('5%') || badgeText.toLowerCase().includes('top 5')) {
          return 'black';
        }
        return 'standard';
      }
    }

    const pageContent = await page.content();
    if (pageContent.includes('Guest favorite')) {
      return 'standard';
    }
    
    return null;
  } catch (error) {
    logger.error('AirbnbScanner', 'Error extracting Guest Favorite tier:', error);
    return null;
  }
}

async function extractHostProfile(page: Page): Promise<HostProfileData | undefined> {
  try {
    // Use updated Airbnb selector for host overview section
    const hostSection = await page.$('[data-section-id="HOST_OVERVIEW_DEFAULT"], [data-section-id="HOST_PROFILE"], section:has-text("Hosted by")');
    if (!hostSection) {
      return undefined;
    }

    let hostName = '';
    // Extract host name from section text - pattern: "Hosted by NameSuperhost" or "Hosted by Name"
    const sectionText = await hostSection.textContent() || '';
    // Match "Hosted by Name" but stop before "Superhost" if present
    const hostMatch = sectionText.match(/Hosted by\s+([A-Za-z]+?)(?:Superhost|$|\s|·)/i);
    if (hostMatch) {
      hostName = hostMatch[1].replace(/Superhost$/i, '').trim();
    } else {
      const nameEl = await hostSection.$('h2, [class*="host"] span, a[href*="/users/show/"] span');
      if (nameEl) {
        const nameText = await nameEl.textContent();
        hostName = nameText?.replace('Hosted by', '').replace(/Superhost/i, '').trim() || '';
      }
    }

    let photoUrl: string | undefined;
    // Try multiple selectors for host photo - Airbnb uses various patterns
    const photoSelectors = [
      'img[src*="profile"]',
      'img[alt*="host"]',
      'picture img',
      'img[src*="avatars"]',
      'img[src*="users"]',
      '[data-testid="host-avatar"] img',
      'a[href*="/users/show/"] img',
      'div[style*="background-image"]'
    ];
    
    for (const selector of photoSelectors) {
      if (photoUrl) break;
      const photoEl = await hostSection.$(selector);
      if (photoEl) {
        if (selector.includes('background-image')) {
          // Extract background-image URL
          const style = await photoEl.getAttribute('style');
          const urlMatch = style?.match(/url\(["']?([^"')]+)["']?\)/);
          if (urlMatch) {
            photoUrl = urlMatch[1];
          }
        } else {
          photoUrl = await photoEl.getAttribute('src') || undefined;
        }
      }
    }
    
    // If still no photo from host section, try the modal later
    logger.info('AirbnbScanner', `Host photo from section: ${photoUrl ? 'Found' : 'Not found'}`);
    

    const isSuperhost = sectionText.includes('Superhost') || await extractSuperHostStatus(page);

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

    const statElements = await hostSection.$$('span, div');
    for (const stat of statElements) {
      const text = await stat.textContent();
      if (!text) continue;
      
      if (text.includes('Response rate')) {
        const match = text.match(/(\d+)%/);
        if (match) responseRate = match[1] + '%';
      }
      if (text.includes('Response time') || text.includes('responds')) {
        responseTime = text.replace('Response time:', '').trim();
      }
      if (!yearsHosting && text.includes('year') && text.includes('hosting')) {
        const match = text.match(/(\d+)/);
        if (match) yearsHosting = parseInt(match[1]);
      }
      if (text.includes('Review') || text.includes('review')) {
        const match = text.match(/(\d+)/);
        if (match) reviewCount = parseInt(match[1]);
      }
      if (text.includes('Identity verified') || text.includes('Verified')) {
        verified = true;
      }
    }

    // Click on host section to open the modal with more details
    try {
      logger.info('AirbnbScanner', 'Clicking host section to open modal...');
      
      // Scroll to the host section first
      await hostSection.scrollIntoViewIfNeeded();
      await delay(500);
      
      // Click on the host section to open the modal
      await hostSection.click({ timeout: 5000 });
      await delay(2000);
      
      // Look for the "Meet your host" modal or profile section
      const modalContent = await page.$('section:has-text("Meet your host"), div[role="dialog"], [data-testid="modal-container"]');
      
      if (modalContent) {
        logger.info('AirbnbScanner', 'Modal opened, extracting host details...');

        // If we didn't find host photo in the section, try inside the modal
        if (!photoUrl) {
          const modalPhotoSelectors = [
            'img[src*="profile"]',
            'img[src*="avatars"]',
            'img[src*="users"]',
            'img[alt*="host"]',
            'picture img',
            '[data-testid="host-avatar"] img',
            'a[href*="/users/show/"] img',
            'div[style*="background-image"] img',
            'img'
          ];
          for (const sel of modalPhotoSelectors) {
            const imgEl = await modalContent.$(sel);
            if (imgEl) {
              const src = await imgEl.getAttribute('src');
              if (src && !src.includes('logo') && !src.includes('icon') && (src.includes('profile') || src.includes('avatar') || src.includes('user') || src.length > 50)) {
                photoUrl = src;
                logger.info('AirbnbScanner', 'Host photo found in modal');
                break;
              }
              const style = await imgEl.getAttribute('style');
              if (style && style.includes('background-image')) {
                const urlMatch = style.match(/url\(["']?([^"')]+)["']?\)/);
                if (urlMatch) {
                  photoUrl = urlMatch[1];
                  logger.info('AirbnbScanner', 'Host photo found in modal (background-image)');
                  break;
                }
              }
            }
            if (photoUrl) break;
          }
          if (!photoUrl) {
            const modalImgs = await modalContent.$$('img');
            for (const img of modalImgs) {
              const src = await img.getAttribute('src');
              if (src && src.startsWith('http') && !src.includes('logo') && !src.includes('airbnb') && (src.includes('profile') || src.includes('avatar') || src.includes('cloudfront') || src.includes('amazonaws'))) {
                photoUrl = src;
                logger.info('AirbnbScanner', 'Host photo found in modal (fallback img)');
                break;
              }
            }
          }
        }
    
        // Extract reviews count and rating from modal
        const modalText = await modalContent.textContent() || '';
        
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
          responseRate = respRateMatch[1] + '%';
        }
        
        const respTimeMatch = modalText.match(/Responds?\s*(within\s+(?:an?\s+)?\w+)/i);
        if (respTimeMatch) {
          // Clean up the response time string
          responseTime = respTimeMatch[1].replace(/Message.*$/i, '').trim();
        }
        
        // Extract attributes - use a general lookahead for common terminators
        // The modal text has concatenated content, so we look for the next label or bio text
        const terminator = "(?=Born|Where|My work|Fun fact|For guests|I spend|Favorite|Most useless|My biography|Lives in|What's for|Identity|Living in|I work in|I'm an|I also|Derek|\\d+ reviews|$)";
        
        const attrDefs = [
          { label: 'My work', pattern: new RegExp("My work:\\s*(.{3,60}?)" + terminator, 'i') },
          { label: 'Fun fact', pattern: new RegExp("Fun fact:\\s*(.{3,80}?)" + terminator, 'i') },
          { label: 'School', pattern: new RegExp("Where I went to school:\\s*(.{3,60}?)" + terminator, 'i') },
          { label: 'For guests', pattern: new RegExp("For guests, I always:\\s*(.{3,80}?)" + terminator, 'i') },
          { label: 'Born', pattern: new RegExp("Born in the\\s*(.{2,20}?)" + terminator, 'i') },
          { label: 'Spends time', pattern: new RegExp("I spend too much time:\\s*(.{3,60}?)" + terminator, 'i') },
          { label: 'Favorite song', pattern: new RegExp("Favorite song[^:]*:\\s*(.{3,60}?)" + terminator, 'i') },
          { label: 'Useless skill', pattern: new RegExp("Most useless skill:\\s*(.{3,80}?)" + terminator, 'i') },
          { label: 'Biography title', pattern: new RegExp("My biography title:\\s*(.{3,80}?)" + terminator, 'i') },
          { label: 'Lives in', pattern: new RegExp("Lives in\\s*(.{3,40}?)" + terminator, 'i') },
          { label: 'Breakfast', pattern: new RegExp("What's for breakfast:\\s*(.{3,60}?)" + terminator, 'i') },
        ];
        
        for (const def of attrDefs) {
          const match = modalText.match(def.pattern);
          if (match) {
            attributes.push(`${def.label}: ${match[1].trim()}`);
          }
        }
        
        // Check for verified status
        if (modalText.includes('Identity verified')) {
          verified = true;
        }
        
        // Extract bio from the modal text - look for paragraph content after attributes
        // Bio typically starts with "Living in..." and ends before "Derek is a Superhost"
        const bioSection = modalText.match(/Living in[\s\S]+?(?=Derek is a Superhost|Host details|Response rate|Message host|$)/i);
        if (bioSection) {
          let bio = bioSection[0].trim();
          // Clean up - remove trailing fragments
          bio = bio.replace(/Derek is a Superhost[\s\S]*$/i, '').trim();
          if (bio.length > 50) {
            aboutText = bio;
          }
        }
        
        // Try to navigate to the full host profile page for all attributes
        try {
          // Find the host profile link in the Meet your host section specifically
          // First try within the modal content, then fall back to page-wide search
          let hostLink = await modalContent.$('a[aria-label="Go to Host full profile"]');
          if (!hostLink) {
            hostLink = await modalContent.$('a[href*="/users/profile/"]');
          }
          if (!hostLink) {
            // Fall back to page-wide search but be more specific
            hostLink = await page.$('section:has-text("Meet your host") a[href*="/users/profile/"]');
          }
          if (hostLink) {
            const href = await hostLink.getAttribute('href');
            if (href) {
              // Navigate directly to avoid click interception issues
              const profileUrl = href.startsWith('http') ? href : 'https://www.airbnb.com' + href;
              logger.info('AirbnbScanner', 'Navigating to host profile:', profileUrl);
              await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
              await delay(3000);
              
              // Scroll to About section which contains Show all
              await page.evaluate(() => window.scrollTo(0, 300));
              await delay(1000);
              
              // Wait for and click Show all button in the profile page (About section)
              try {
                const showAllBtn = await page.waitForSelector('button:has-text("Show all")', { timeout: 5000 });
                if (showAllBtn) {
                  logger.info('AirbnbScanner', 'Clicking Show all for more attributes...');
                  await showAllBtn.click({ timeout: 5000 });
                  await delay(2500);
                }
              } catch {
                logger.info('AirbnbScanner', 'No Show all button on profile page');
              }
              
              // Extract from the full profile view
              const profileText = await page.textContent('body') || '';
              
              // Re-extract attributes from full profile - this has all the expanded content
              for (const def of attrDefs) {
                const match = profileText.match(def.pattern);
                if (match) {
                  const attr = `${def.label}: ${match[1].trim()}`;
                  if (!attributes.some(a => a.startsWith(def.label))) {
                    attributes.push(attr);
                  }
                }
              }
              
              // Check for verified
              if (profileText.includes('Identity verified')) {
                verified = true;
              }
              
              // Also extract bio from profile page if not found yet
              if (!aboutText) {
                const bioProfMatch = profileText.match(/Living in[\s\S]+?(?=Derek's reviews|Show more reviews|Where you'll be|\d+ listings|$)/i);
                if (bioProfMatch) {
                  let bio = bioProfMatch[0].trim();
                  bio = bio.replace(/Derek's reviews[\s\S]*$/i, '').trim();
                  if (bio.length > 50 && bio.length < 1500) {
                    aboutText = bio;
                  }
                }
              }
            }
          }
        } catch (e) {
          logger.info('AirbnbScanner', 'Could not access full host profile');
        }
        
        // Close the modal by pressing Escape or clicking close button
        try {
          const closeButton = await page.$('button[aria-label="Close"], [data-testid="modal-close-button"]');
          if (closeButton) {
            await closeButton.click({ timeout: 2000 });
          } else {
            await page.keyboard.press('Escape');
          }
          await delay(500);
        } catch {
          // Modal might have closed automatically
        }
      }
    } catch (e) {
      logger.info('AirbnbScanner', 'Could not open host modal, using basic data');
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
    logger.error('AirbnbScanner', 'Error extracting Host Profile:', error);
    return undefined;
  }
}

export async function scanAirbnbListing(airbnbUrl: string): Promise<AirbnbScanResult> {
  let page: Page | null = null;
  
  try {
    logger.info('AirbnbScanner', `Starting scan for: ${airbnbUrl}`);
    
    const browser = await getBrowser();
    page = await browser.newPage();
    
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    logger.info('AirbnbScanner', 'Navigating to page...');
    await page.goto(airbnbUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await delay(3000);

    // Close any modals that might be blocking (with short timeout)
    try {
      const closeModalButton = await page.$('button[aria-label="Close"], [data-testid="modal-close-button"]');
      if (closeModalButton) {
        await closeModalButton.click({ timeout: 3000 });
        await delay(500);
      }
    } catch {
      // Modal close button may not be visible, continue anyway
    }

    // Scroll down the page to trigger lazy loading of all sections
    logger.info('AirbnbScanner', 'Scrolling to load lazy content...');
    await page.evaluate(async () => {
      const scrollStep = 500;
      const maxScroll = document.body.scrollHeight;
      for (let scrollPos = 0; scrollPos < maxScroll; scrollPos += scrollStep) {
        window.scrollTo(0, scrollPos);
        await new Promise(r => setTimeout(r, 200));
      }
      // Scroll back to top
      window.scrollTo(0, 0);
    });
    
    await delay(2000); // Wait for content to render after scrolling

    logger.info('AirbnbScanner', 'Extracting data...');

    const [sleepResult, isSuperhost, guestFavoriteTier, hostProfile] = await Promise.all([
      extractWhereYoullSleep(page),
      extractSuperHostStatus(page),
      extractGuestFavoriteTier(page),
      extractHostProfile(page),
    ]);

    const rawSnapshot = {
      url: airbnbUrl,
      scannedAt: new Date().toISOString(),
      pageTitle: await page.title(),
    };

    logger.info('AirbnbScanner', 'Scan complete. Results:', {
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
    const rawMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('AirbnbScanner', 'Error during scan:', error);

    // Helpful message when Chromium is missing (common in production if postbuild didn't run)
    const isBrowserMissing =
      /executable doesn't exist|Failed to launch|browserType\.launch|Could not find browser/i.test(rawMessage);
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

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
