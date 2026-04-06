import axios from 'axios';

// Access token en memoria — actualizado desde el auth store
let _accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  _accessToken = token;
}

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // envía la cookie refreshToken automáticamente
});

// Adjuntar access token desde memoria
api.interceptors.request.use((config) => {
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;
  return config;
});

// Fix race condition: todas las peticiones con 401 simultáneas comparten un único refresh
let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post('/api/v1/auth/refresh', {}, { withCredentials: true })
            .then(({ data }) => data.accessToken as string)
            .finally(() => { refreshPromise = null; });
        }
        const newToken = await refreshPromise;
        if (!newToken) throw new Error('No token');
        setApiAccessToken(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      } catch {
        setApiAccessToken(null);
        if (typeof window !== 'undefined') {
          // Limpiar estado persistido de Zustand y redirigir a login
          localStorage.removeItem('emeb-auth');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
