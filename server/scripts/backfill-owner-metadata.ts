import { db } from "../db";
import { dataSources, listings } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

const HOSPITABLE_API_BASE = "https://public.api.hospitable.com/v2";

async function fetchWithToken(token: string, endpoint: string) {
  const url = endpoint.startsWith("http") ? endpoint : `${HOSPITABLE_API_BASE}${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function backfillOwnerMetadata() {
  logger.info("BackfillOwner", "Starting owner metadata backfill...");

  const allSources = await db.select().from(dataSources).where(eq(dataSources.provider, "hospitable"));

  logger.info("BackfillOwner", `Found ${allSources.length} Hospitable data source(s)`);

  // Build a map of userId -> best (most recently valid) access token + all data source IDs for that user
  const userTokenMap = new Map<string, { token: string; dataSourceIds: string[] }>();

  for (const source of allSources) {
    if (!source.accessToken) continue;
    const existing = userTokenMap.get(source.userId);
    if (!existing) {
      userTokenMap.set(source.userId, { token: source.accessToken, dataSourceIds: [source.id] });
    } else {
      existing.dataSourceIds.push(source.id);
      // Prefer the token with a later expiry
      const srcExpiry = source.tokenExpiresAt ? new Date(source.tokenExpiresAt).getTime() : 0;
      const existingSource = allSources.find((s) => s.accessToken === existing.token);
      const existExpiry = existingSource?.tokenExpiresAt ? new Date(existingSource.tokenExpiresAt).getTime() : 0;
      if (srcExpiry > existExpiry) {
        existing.token = source.accessToken;
      }
    }
  }

  let totalUpdated = 0;

  for (const [userId, { token, dataSourceIds }] of userTokenMap.entries()) {
    logger.info("BackfillOwner", `Processing user ${userId} (${dataSourceIds.length} data source(s))`);

    try {
      // Fetch all pages of properties with user include
      let nextUrl: string | null = `${HOSPITABLE_API_BASE}/properties?include=listings,user&per_page=100`;
      const allProperties: any[] = [];

      while (nextUrl) {
        const data = await fetchWithToken(token, nextUrl);
        const page: any[] = data?.data || [];
        allProperties.push(...page);
        nextUrl = data?.links?.next || null;
      }

      logger.info("BackfillOwner", `  Got ${allProperties.length} properties from Hospitable`);

      // Get ALL listings for this user across all their data sources
      const userListings = await db.select().from(listings).where(eq(listings.userId, userId));
      logger.info("BackfillOwner", `  Found ${userListings.length} listings for user`);

      for (const property of allProperties) {
        // Match by externalId across all data sources for this user
        const existing = userListings.find((l) => l.externalId === property.id);
        if (!existing) continue;

        const airbnbListing = Array.isArray(property.listings)
          ? property.listings.find((l: any) => l.platform === "airbnb")
          : null;

        const resolvedOwnerName: string | null =
          property.owner?.name ||
          property.user?.name ||
          (property.user?.first_name
            ? `${property.user.first_name} ${property.user.last_name || ""}`.trim()
            : null) ||
          airbnbListing?.platform_name ||
          null;

        const resolvedAccountEmail: string | null =
          property.owner?.email ||
          property.user?.email ||
          airbnbListing?.platform_email ||
          null;

        if (resolvedOwnerName || resolvedAccountEmail) {
          await db
            .update(listings)
            .set({
              ownerName: resolvedOwnerName ?? existing.ownerName,
              accountEmail: resolvedAccountEmail ?? existing.accountEmail,
            })
            .where(eq(listings.id, existing.id));

          logger.info(
            "BackfillOwner",
            `  Updated listing "${existing.name}": owner="${resolvedOwnerName}", email="${resolvedAccountEmail}"`
          );
          totalUpdated++;
        }
      }
    } catch (err: any) {
      logger.error("BackfillOwner", `  Error for user ${userId}:`, err.message);
    }
  }

  logger.info("BackfillOwner", `Backfill complete. Updated ${totalUpdated} listing(s).`);
}

backfillOwnerMetadata()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("BackfillOwner", "Fatal error:", err);
    process.exit(1);
  });
