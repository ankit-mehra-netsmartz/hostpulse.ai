import { storage } from "../storage";
import { config } from "../config";
import { logger } from "../logger";

const isDevelopment = config.isDevelopment;

const HOSPITABLE_CLIENT_ID = isDevelopment && config.hospitable.clientIdDev
  ? config.hospitable.clientIdDev
  : config.hospitable.clientId;

const HOSPITABLE_CLIENT_SECRET = isDevelopment && config.hospitable.clientSecretDev
  ? config.hospitable.clientSecretDev
  : config.hospitable.clientSecret;

const HOSPITABLE_AUTH_URL = "https://auth.hospitable.com/oauth/token";
const HOSPITABLE_API_BASE = "https://public.api.hospitable.com/v2";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface RefreshResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  needsReconnect?: boolean;
}

export async function refreshHospitableToken(dataSourceId: string): Promise<RefreshResult> {
  try {
    const dataSource = await storage.getDataSource(dataSourceId);
    
    if (!dataSource) {
      logger.error('Hospitable', `Data source ${dataSourceId} not found`);
      return { success: false, error: "Data source not found" };
    }
    
    if (!dataSource.refreshToken) {
      logger.error('Hospitable', `No refresh token for data source ${dataSourceId}`);
      await storage.updateDataSource(dataSourceId, {
        isConnected: false,
      });
      return { success: false, error: "No refresh token available. Please reconnect your account." };
    }
    
    logger.info('Hospitable', `Refreshing token for data source ${dataSourceId}`);
    
    const refreshResponse = await fetch(HOSPITABLE_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: HOSPITABLE_CLIENT_ID,
        client_secret: HOSPITABLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: dataSource.refreshToken,
      }),
    });
    
    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      logger.error('Hospitable', `Token refresh failed (HTTP ${refreshResponse.status}) for data source ${dataSourceId}: ${errorText}`);
      logger.error('Hospitable', `Client ID used: ${HOSPITABLE_CLIENT_ID?.substring(0, 8)}..., isDev: ${isDevelopment}`);
      
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        await storage.updateDataSource(dataSourceId, {
          isConnected: false,
        });
        return { 
          success: false, 
          error: "Hospitable refresh token has expired. Please reconnect your Hospitable account in Settings.",
          needsReconnect: true
        };
      }
      
      return { success: false, error: `Token refresh failed (HTTP ${refreshResponse.status}): ${errorText}` };
    }
    
    const tokenData: TokenResponse = await refreshResponse.json();
    
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    
    await storage.updateDataSource(dataSourceId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt: expiresAt,
      isConnected: true,
    });
    
    logger.info('Hospitable', `Token refreshed successfully for data source ${dataSourceId}, expires at ${expiresAt.toISOString()}`);
    
    return { success: true, accessToken: tokenData.access_token };
  } catch (error) {
    logger.error('Hospitable', `Error refreshing token for data source ${dataSourceId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

export async function getValidAccessToken(dataSourceId: string): Promise<{ accessToken: string | null; error?: string; needsReconnect?: boolean }> {
  const dataSource = await storage.getDataSource(dataSourceId);
  
  if (!dataSource) {
    return { accessToken: null, error: "Data source not found" };
  }
  
  if (!dataSource.isConnected) {
    return { accessToken: null, error: "Hospitable is not connected. Please reconnect your account.", needsReconnect: true };
  }
  
  const now = new Date();
  const tokenExpiry = dataSource.tokenExpiresAt ? new Date(dataSource.tokenExpiresAt) : null;
  const needsRefresh = !dataSource.accessToken || 
                       (tokenExpiry && now.getTime() > tokenExpiry.getTime() - TOKEN_EXPIRY_BUFFER_MS);
  
  if (needsRefresh) {
    logger.info('Hospitable', `Token needs refresh for data source ${dataSourceId} (expired: ${tokenExpiry?.toISOString() || 'no expiry set'})`);
    const refreshResult = await refreshHospitableToken(dataSourceId);
    
    if (!refreshResult.success) {
      return { accessToken: null, error: refreshResult.error, needsReconnect: refreshResult.needsReconnect };
    }
    
    return { accessToken: refreshResult.accessToken! };
  }
  
  return { accessToken: dataSource.accessToken! };
}

interface HospitableApiOptions {
  method?: string;
  body?: any;
}

export async function hospitableApiRequest<T = any>(
  dataSourceId: string,
  endpoint: string,
  options: HospitableApiOptions = {}
): Promise<{ data: T | null; error?: string; statusCode?: number }> {
  const { accessToken, error: tokenError } = await getValidAccessToken(dataSourceId);
  
  if (!accessToken) {
    return { data: null, error: tokenError || "No valid access token" };
  }
  
  const url = endpoint.startsWith("http") ? endpoint : `${HOSPITABLE_API_BASE}${endpoint}`;
  
  const fetchOptions: RequestInit = {
    method: options.method || "GET",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  };
  
  if (options.body) {
    fetchOptions.body = JSON.stringify(options.body);
  }
  
  try {
    const response = await fetch(url, fetchOptions);
    
    if (response.status === 401) {
      logger.info('Hospitable', `Got 401, attempting token refresh for data source ${dataSourceId}`);
      const refreshResult = await refreshHospitableToken(dataSourceId);
      
      if (!refreshResult.success) {
        return { 
          data: null, 
          error: "Authentication failed. Please reconnect your Hospitable account.",
          statusCode: 401 
        };
      }
      
      const retryResponse = await fetch(url, {
        ...fetchOptions,
        headers: {
          "Authorization": `Bearer ${refreshResult.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!retryResponse.ok) {
        const errorText = await retryResponse.text();
        return { data: null, error: errorText, statusCode: retryResponse.status };
      }
      
      const data = await retryResponse.json();
      return { data };
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Hospitable', `API error for ${endpoint}:`, response.status, errorText);
      return { data: null, error: errorText, statusCode: response.status };
    }
    
    const data = await response.json();
    return { data };
  } catch (error) {
    logger.error('Hospitable', `Request error for ${endpoint}:`, error);
    return { 
      data: null, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function fetchHospitableProperties(dataSourceId: string) {
  return hospitableApiRequest(
    dataSourceId,
    "/properties?include=listings,details,user&per_page=100"
  );
}

export async function fetchHospitableReservations(
  dataSourceId: string,
  propertyId: string,
  startDate: string,
  endDate: string
) {
  const params = new URLSearchParams({
    "filter[property]": propertyId,
    "filter[arrive_after]": startDate,
    "filter[depart_before]": endDate,
    "per_page": "100",
  });
  
  return hospitableApiRequest(
    dataSourceId,
    `/reservations?${params.toString()}`
  );
}

export async function fetchHospitableReviews(
  dataSourceId: string,
  propertyId: string
) {
  const params = new URLSearchParams({
    "filter[property]": propertyId,
    "per_page": "100",
  });
  
  return hospitableApiRequest(
    dataSourceId,
    `/reviews?${params.toString()}`
  );
}

export async function fetchHospitableMessages(
  dataSourceId: string,
  reservationId: string
) {
  return hospitableApiRequest(
    dataSourceId,
    `/reservations/${reservationId}/messages`
  );
}

const PROACTIVE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const PROACTIVE_REFRESH_CHECK_INTERVAL_MS = 30 * 60 * 1000;

let proactiveRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function refreshAllExpiringTokens() {
  try {
    const allDataSources = await storage.getAllDataSources();
    const hospitableSources = allDataSources.filter(
      ds => ds.type === "hospitable" && ds.isConnected && ds.refreshToken
    );

    if (hospitableSources.length === 0) return;

    const now = Date.now();

    for (const ds of hospitableSources) {
      const tokenExpiry = ds.tokenExpiresAt ? new Date(ds.tokenExpiresAt).getTime() : 0;
      const timeUntilExpiry = tokenExpiry - now;

      if (!ds.accessToken || timeUntilExpiry < PROACTIVE_REFRESH_INTERVAL_MS) {
        logger.info('Hospitable', `Proactively refreshing token for data source ${ds.id} (expires in ${Math.round(timeUntilExpiry / 60000)} min)`);
        const result = await refreshHospitableToken(ds.id);
        if (!result.success) {
          logger.error('Hospitable', `Proactive refresh failed for data source ${ds.id}: ${result.error}`);
        }
      }
    }
  } catch (error) {
    logger.error('Hospitable', 'Error during proactive token refresh:', error);
  }
}

export function startProactiveTokenRefresh() {
  if (proactiveRefreshTimer) return;

  logger.info('Hospitable', 'Starting proactive token refresh (checking every 30 min)');

  refreshAllExpiringTokens();

  proactiveRefreshTimer = setInterval(refreshAllExpiringTokens, PROACTIVE_REFRESH_CHECK_INTERVAL_MS);
}

export function stopProactiveTokenRefresh() {
  if (proactiveRefreshTimer) {
    clearInterval(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}
