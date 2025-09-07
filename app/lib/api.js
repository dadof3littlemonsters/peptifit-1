import axios from 'axios';

// API base URL - will use the rewrite rule to proxy to backend
const API_BASE_URL = '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('peptifit_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('peptifit_token');
      localStorage.removeItem('peptifit_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth functions
export const auth = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    if (response.data.token) {
      localStorage.setItem('peptifit_token', response.data.token);
      localStorage.setItem('peptifit_user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (username, email, password) => {
    const response = await api.post('/auth/register', { username, email, password });
    if (response.data.token) {
      localStorage.setItem('peptifit_token', response.data.token);
      localStorage.setItem('peptifit_user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout: () => {
    localStorage.removeItem('peptifit_token');
    localStorage.removeItem('peptifit_user');
    window.location.href = '/login';
  },

  getCurrentUser: () => {
    const user = localStorage.getItem('peptifit_user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => {
    return !!localStorage.getItem('peptifit_token');
  },
};

// Peptide functions
export const peptides = {
  getAll: async () => {
    const response = await api.get('/peptides');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/peptides/${id}`);
    return response.data;
  },
};

// Dose functions
export const doses = {
  create: async (doseData) => {
    const response = await api.post('/doses', doseData);
    return response.data;
  },

  getAll: async () => {
    const response = await api.get('/doses');
    return response.data;
  },

  getRecent: async () => {
    const response = await api.get('/doses/recent');
    return response.data;
  },
};

// Schedule functions
export const schedules = {
  create: async (scheduleData) => {
    const response = await api.post('/schedules', scheduleData);
    return response.data;
  },

  getAll: async () => {
    const response = await api.get('/schedules');
    return response.data;
  },
};

export default api;
