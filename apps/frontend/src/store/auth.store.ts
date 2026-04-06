'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import type { User } from '@/types';
import api, { setApiAccessToken } from '@/lib/api';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setAccessToken: (token: string) => void;
  fetchMe: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        setApiAccessToken(data.accessToken);
        set({ accessToken: data.accessToken, isAuthenticated: true });
        const me = await api.get('/auth/me');
        set({ user: me.data });
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {
          // ignorar errores de red en logout
        }
        setApiAccessToken(null);
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      setAccessToken: (token: string) => {
        setApiAccessToken(token);
        set({ accessToken: token, isAuthenticated: true });
      },

      fetchMe: async () => {
        const { data } = await api.get('/auth/me');
        set({ user: data, isAuthenticated: true });
      },

      // Llamar al montar la app para recuperar sesión desde la cookie HttpOnly
      initialize: async () => {
        try {
          const { data } = await axios.post(
            '/api/v1/auth/refresh',
            {},
            { withCredentials: true },
          );
          setApiAccessToken(data.accessToken);
          set({ accessToken: data.accessToken, isAuthenticated: true });
          const me = await api.get('/auth/me');
          set({ user: me.data });
        } catch {
          setApiAccessToken(null);
          set({ user: null, accessToken: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: 'emeb-auth',
      // Solo persistir user e isAuthenticated — el accessToken queda en memoria
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
