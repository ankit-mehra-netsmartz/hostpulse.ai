import { config } from "../config";
import { db } from "../db";
import { dataSources, listings } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";
import crypto from "crypto";

const CONNECT_API_BASE = "https://connect.hospitable.com/api/v1";

type ConnectUser = {
  id: string;
  email: string;
  name?: string;
};

interface CreateCustomerResponse {
  customer_id: string;
}

interface GenerateAuthCodeResponse {
  auth_code: string;
  expires_at: string;
  return_url?: string;
  data?: {
    return_url?: string;
  };
}

interface HospitableConnectWebhookPayload {
  id: string;
  action: string;
  created: string;
  version: string;
  customer_id: string;

  data: {
    id: string;
    name: string;
    picture: string | null;

    customer: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      timezone: string;
      ip_address: string | null;
    };

    location: string | null;
    platform: string;
    description: string | null;
    platform_id: string;
    ready_to_migrate: boolean;
    first_connected_at: string;
  };
}

interface ChannelListingsResponse {
  listings: Array<{
    id: string;
    name: string;
    images?: Array<{
      url: string;
    }>;
  }>;
}

export const connectHospitableService = {
  get headers() {
    return {
      "Connect-Version": "",
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${config.hospitable.connectToken || ""}`,
    };
  },

  /**
   * Object-style API matching the frontend snippet.
   */
  async createCustomer(user: ConnectUser): Promise<Response> {
    if (!config.hospitable.connectToken) {
      throw new Error("HOSPITABLE_CONNECT_TOKEN not configured");
    }

    return fetch(`${CONNECT_API_BASE}/customers`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name || "User",
        timezone: "Europe/Paris",
      }),
    });
  },

  /**
   * Object-style API matching the frontend snippet.
   */
  async generateAuthCode(
    customerId: string,
    redirectUrl: string,
  ): Promise<Response> {
    if (!config.hospitable.connectToken) {
      throw new Error("HOSPITABLE_CONNECT_TOKEN not configured");
    }

    return fetch(`${CONNECT_API_BASE}/auth-codes`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        customer_id: customerId,
        redirect_url: redirectUrl,
      }),
    });
  },

  /**
   * Backend helper: create a customer and return customer_id.
   */
  async createCustomerForWorkspace(
    email: string,
    userId: string,
    name: string,
    workspaceId: string | undefined,
    originUrl: string,
  ): Promise<string> {
    if (!config.hospitable.connectToken) {
      throw new Error("HOSPITABLE_CONNECT_TOKEN not configured");
    }

    try {
      const response = await this.createCustomer({
        id: userId,
        email,
        name,
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error("Failed to create Hospitable Connect customer:", error);
        throw new Error(
          `Hospitable Connect customer creation failed: ${response.statusText}`,
        );
      }

      const data = (await response.json()) as CreateCustomerResponse & {
        metadata?: Record<string, unknown>;
      };
      return data.customer_id;
    } catch (error) {
      logger.error("Error creating Hospitable Connect customer:", error);
      throw error;
    }
  },

  /**
   * Backend helper: generate auth code and return parsed payload.
   */
  async generateAuthCodeForCustomer(
    customerId: string,
    returnUrl: string,
  ): Promise<{ authCode: string; expiresAt: string; returnUrl?: string }> {
    if (!config.hospitable.connectToken) {
      throw new Error("HOSPITABLE_CONNECT_TOKEN not configured");
    }

    try {
      const response = await this.generateAuthCode(customerId, returnUrl);

      if (!response.ok) {
        const error = await response.text();
        logger.error("Failed to generate auth code:", error);
        throw new Error(`Auth code generation failed: ${response.statusText}`);
      }

      const data: GenerateAuthCodeResponse = await response.json();
      return {
        authCode: data.auth_code,
        expiresAt: data.expires_at,
        returnUrl: data.return_url || data.data?.return_url,
      };
    } catch (error) {
      logger.error("Error generating Hospitable Connect auth code:", error);
      throw error;
    }
  },

  /**
   * Get customer listings from a Hospitable Connect channel
   */
  async getCustomerListings(
    customerId: string,
  ): Promise<ChannelListingsResponse> {
    if (!config.hospitable.connectToken) {
      throw new Error("HOSPITABLE_CONNECT_TOKEN not configured");
    }

    try {
      const response = await fetch(
        `${CONNECT_API_BASE}/customers/${customerId}/listings`,
        {
          headers: {
            Authorization: `Bearer ${config.hospitable.connectToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        logger.error(`Failed to fetch listings for customer ${customerId}`);
        return { listings: [] };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.error("Error fetching Hospitable Connect listings:", error);
      return { listings: [] };
    }
  },

  /**
   * Verify webhook signature from Hospitable Connect
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret =
      config.hospitable.connectWebhookSecret || config.hospitable.webhookSecret;
    if (!secret) {
      logger.warn("No webhook secret configured for Hospitable Connect");
      return false;
    }

    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return hash === signature;
  },

  /**
   * Handle Hospitable Connect webhook (channel.activated event)
   * Creates or updates data source when channel is connected
   */
  async handleWebhook(payload: HospitableConnectWebhookPayload): Promise<void> {
    const { action, data } = payload;

    if (action !== "channel.activated") {
      logger.debug(`Ignoring Hospitable Connect webhook type: ${action}`);
      return;
    }

    try {
      // Find the data source by customer ID
      const dataSourcesToUpdate = await db
        .select()
        .from(dataSources)
        .where(
          and(
            eq(dataSources.provider, "airbnb"),
            eq(dataSources.externalCustomerId, data.customer.id),
          ),
        );

      if (dataSourcesToUpdate.length === 0) {
        logger.warn(`No data source found for customer ${data.customer.id}`);
        return;
      }
      console.log("Data sources to update:", dataSourcesToUpdate);
      const dataSource = dataSourcesToUpdate[0];

      // Update data source to mark as connected
      const updatedDataSource = await db
        .update(dataSources)
        .set({
          isConnected: true,
          updatedAt: new Date(),
        })
        .where(eq(dataSources.externalCustomerId, data.customer.id));
      console.log("Updated data source:", updatedDataSource);
      logger.info(
        `Marked Airbnb data source ${dataSource.id} as connected via Hospitable Connect`,
      );

      // Sync listings for this data source
      await this.syncConnectListings(dataSource.id, data.customer.id);
    } catch (error) {
      logger.error("Error handling Hospitable Connect webhook:", error);
      throw error;
    }
  },

  /**
   * Sync listings for a Hospitable Connect channel
   */
  async syncConnectListings(
    dataSourceId: string,
    customerId: string,
  ): Promise<void> {
    try {
      // Fetch listings from Hospitable Connect
      const listingsData = await this.getCustomerListings(customerId);
      console.log(listingsData, "Listings data from Hospitable Connect");
      const source = await db.query.dataSources.findFirst({
        where: eq(dataSources.id, dataSourceId),
      });

      if (!source) {
        logger.warn(
          `Cannot sync listings: data source ${dataSourceId} not found`,
        );
        return;
      }
      console.log("Data source for syncing listings:", source);
      // Create/update listings in database
      for (const listing of listingsData.listings) {
        const imageUrls =
          listing.images?.map((img) => img.url).filter(Boolean) || [];

        await db
          .insert(listings)
          .values({
            dataSourceId,
            externalId: listing.id,
            name: listing.name,
            images: imageUrls,
            platformIds: { airbnb: listing.id },
            userId: source.userId,
            workspaceId: source.workspaceId || null,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [listings.dataSourceId, listings.externalId],
            set: {
              name: listing.name,
              images: imageUrls,
              updatedAt: new Date(),
            },
          });
      }

      // Update last sync time
      await db
        .update(dataSources)
        .set({
          lastSyncAt: new Date(),
        })
        .where(eq(dataSources.id, dataSourceId));

      logger.info(
        `Synced ${listingsData.listings.length} listings for data source ${dataSourceId}`,
      );
    } catch (error) {
      logger.error(
        `Error syncing Hospitable Connect listings for ${dataSourceId}:`,
        error,
      );
      throw error;
    }
  },
};

// Backward-compatible alias for existing imports.
export const hospitable_connect = connectHospitableService;
