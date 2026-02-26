import axios from 'axios';

// API base URL - points directly to backend
const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'https://trax.delboysden.uk/api')
  : '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('peptifit_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('peptifit_token');
        localStorage.removeItem('peptifit_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth functions
export const auth = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    if (response.data.token && typeof window !== 'undefined') {
      localStorage.setItem('peptifit_token', response.data.token);
      localStorage.setItem('peptifit_user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (username, email, password) => {
    const response = await api.post('/auth/register', { username, email, password });
    if (response.data.token && typeof window !== 'undefined') {
      localStorage.setItem('peptifit_token', response.data.token);
      localStorage.setItem('peptifit_user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('peptifit_token');
      localStorage.removeItem('peptifit_user');
      window.location.href = '/login';
    }
  },

  getCurrentUser: () => {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem('peptifit_user');
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => {
    if (typeof window === 'undefined') return false;
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

// Peptide config functions (for configured peptides)
export const peptideConfigs = {
  getAll: async () => {
    const response = await api.get('/peptides/configs');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/peptides/configs/${id}`);
    return response.data;
  },

  getSuggestedDose: async (id) => {
    const response = await api.get(`/peptides/configs/${id}/suggested-dose`);
    return response.data;
  },

  create: async (configData) => {
    const response = await api.post('/peptides/configs', configData);
    return response.data;
  },

  update: async (id, configData) => {
    const response = await api.put(`/peptides/configs/${id}`, configData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/peptides/configs/${id}`);
    return response.data;
  },
};

// Peptide dose logging functions (uses /doses endpoints)
export const peptideDoses = {
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

// Supplements functions
export const supplements = {
  getAll: async () => {
    const response = await api.get('/supplements');
    return response.data;
  },

  create: async (supplementData) => {
    const response = await api.post('/supplements', supplementData);
    return response.data;
  },

  update: async (id, supplementData) => {
    const response = await api.put(`/supplements/${id}`, supplementData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/supplements/${id}`);
    return response.data;
  },

  logDose: async (id, logData) => {
    const response = await api.post(`/supplements/${id}/log`, logData);
    return response.data;
  },

  getLogs: async (id, params = {}) => {
    const { limit = 50, offset = 0 } = params;
    const response = await api.get(`/supplements/${id}/logs`, {
      params: { limit, offset }
    });
    return response.data;
  }
};

// Vitals functions
export const vitals = {
  // Log a new vital reading
  create: async (vitalData) => {
    const response = await api.post('/vitals', vitalData);
    return response.data;
  },

  // Get vitals with optional filters
  getAll: async (filters = {}) => {
    const { type, start, end, limit = 100 } = filters;
    const response = await api.get('/vitals', {
      params: { type, start, end, limit }
    });
    return response.data;
  },

  // Get latest reading for each vital type
  getLatest: async () => {
    const response = await api.get('/vitals/latest');
    return response.data;
  },

  // Get history for a specific vital type
  getHistory: async (type, days = 30) => {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const response = await api.get('/vitals', {
      params: { type, start, end, limit: days }
    });
    return response.data;
  }
};

// Blood results functions
export const bloodResults = {
  getAll: async () => {
    const response = await api.get('/blood-results');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/blood-results/${id}`);
    return response.data;
  },

  create: async (bloodResultData) => {
    const response = await api.post('/blood-results', bloodResultData);
    return response.data;
  },

  analyze: async (id) => {
    const response = await api.post(`/blood-results/${id}/analyze`);
    return response.data;
  }
};

// Meals functions
export const meals = {
  getAll: async (filters = {}) => {
    const { date, start, end, limit = 100 } = filters;
    const response = await api.get('/meals', {
      params: { date, start, end, limit }
    });
    return response.data;
  },

  getByDate: async (date) => {
    const response = await api.get('/meals', {
      params: { date }
    });
    return response.data;
  },

  create: async (mealData) => {
    const response = await api.post('/meals', mealData);
    return response.data;
  },

  update: async (id, mealData) => {
    const response = await api.put(`/meals/${id}`, mealData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/meals/${id}`);
    return response.data;
  },

  // Get frequent foods for quick add
  getFrequentFoods: async (limit = 20) => {
    const response = await api.get('/meals/frequent-foods', {
      params: { limit }
    });
    return response.data;
  },

  // Copy meals from a previous date
  copyFromDate: async (sourceDate, targetDate) => {
    const response = await api.post('/meals/copy', {
      source_date: sourceDate,
      target_date: targetDate
    });
    return response.data;
  }
};

export default api;
