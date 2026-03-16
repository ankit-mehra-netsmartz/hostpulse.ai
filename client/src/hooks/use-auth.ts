import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/models/auth";

export type AuthUser = User & {
  isImpersonating?: boolean;
};

async function fetchUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  window.location.href = "/api/logout";
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}

// ---------------------------------------------------------------------------
// Email / password helpers (used by LoginForm and SignupForm)
// ---------------------------------------------------------------------------

export interface EmailSignupPayload {
  email: string;
  password: string;
  name: string;
}

export interface EmailLoginPayload {
  email: string;
  password: string;
}

async function postJson(url: string, body: object) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message ?? "Request failed");
  }
  return data;
}

export function useSignupWithEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmailSignupPayload) =>
      postJson("/api/auth/signup", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });
}

export function useLoginWithEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmailLoginPayload) =>
      postJson("/api/auth/login", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
  });
}
