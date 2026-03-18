import { apiRequest } from "@/lib/queryClient";

export type ConnectUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export const connectHospitableService = {
  // Kept for API parity with the requested shape.
  headers: {
    "Connect-Version": "",
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  async createCustomer(user: ConnectUser): Promise<Response> {
    return apiRequest("POST", "/api/hospitable-connect/customers", {
      userId: user.id,
      email: user.email,
      name: user.name,
    });
  },

  async generateAuthCode(
    user: ConnectUser,
    redirectUrl?: string,
  ): Promise<Response> {
    return apiRequest("POST", "/api/hospitable-connect/auth-codes", {
      userId: user.id,
      returnUrl: redirectUrl,
    });
  },
};
