import { supabase } from './supabase';
import { VerifyResponse } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class ApiService {
  private async authHeaders(): Promise<Record<string, string>> {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data } = await supabase.auth.refreshSession();
      session = data.session;
    }
    const token = session?.access_token;
    if (!token) {
      throw new Error('Not authenticated. Please login again.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
  }

  private async request<T>(path: string, options: RequestInit = {}, timeoutMs = 30000): Promise<T> {
    const headers = await this.authHeaders();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs / 1000}s — check that the backend is running`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) {
      await supabase.auth.signOut();
      window.location.reload();
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      let detail = 'Request failed';
      try {
        const errBody = await response.json();
        detail = errBody.detail || errBody.message || JSON.stringify(errBody);
      } catch {}
      throw new Error(`${response.status}: ${detail}`);
    }

    return response.json() as Promise<T>;
  }

  async approveRequest(requestId: string, adminName: string): Promise<{ message: string; verification_payload?: string }> {
    const baseUrl = encodeURIComponent(window.location.origin);
    return this.request(`/admin/approve/${requestId}?admin_name=${encodeURIComponent(adminName)}&base_url=${baseUrl}`, {
      method: 'POST',
    });
  }

  async createStudentAuth(email: string, password: string, fullName: string): Promise<{ user_id: string; email: string }> {
    return this.request('/admin/create-student-auth', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName }),
    }, 30000);
  }

  async createStudentProfile(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request('/admin/create-student-profile', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async rejectRequest(requestId: string, adminName: string, reason: string): Promise<{ message: string }> {
    return this.request(
      `/admin/reject/${requestId}?admin_name=${encodeURIComponent(adminName)}&reason=${encodeURIComponent(reason)}`,
      { method: 'POST' }
    );
  }

  /**
   * Public endpoint — no auth header required.
   *
   * With token   → strong verification (psid + 128-bit token exact match)
   * Without token → legacy verification (psid-only lookup, returns legacy=true)
   */
  async verifyDocument(psid: string, token?: string): Promise<VerifyResponse> {
    const params = token ? `?token=${encodeURIComponent(token)}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${BASE_URL}/verify/verify/${psid}${params}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error('Verification request failed');
      }
      return response.json() as Promise<VerifyResponse>;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const api = new ApiService();
