import axios from 'axios';

const TOKEN_KEYS = ['peptifit_token', 'token'];
const USER_STORAGE_KEY = 'peptifit_user';
const SETTINGS_FALLBACK_API_URLS = ['/api', 'https://trax.delboysden.uk/api'];
const ACCOUNT_SETTING_STORAGE_MAP = {
  weight_unit: 'peptifit_weight_unit',
  glucose_unit: 'peptifit_glucose_unit',
  temp_unit: 'peptifit_temp_unit',
  height_unit: 'peptifit_height_unit',
  height_cm: 'peptifit_height_cm',
  height_ft: 'peptifit_height_ft',
  height_in: 'peptifit_height_in',
  target_weight: 'peptifit_target_weight',
  calorie_goal: 'peptifit_calorie_goal',
  protein_goal: 'peptifit_protein_goal',
  adherence_goal: 'peptifit_adherence_goal'
};

const getStoredToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return TOKEN_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || null;
};

const storeToken = (token) => {
  if (typeof window === 'undefined') {
    return;
  }

  TOKEN_KEYS.forEach((key) => localStorage.setItem(key, token));
};

const clearStoredAuth = () => {
  if (typeof window === 'undefined') {
    return;
  }

  TOKEN_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(USER_STORAGE_KEY);
};

const mirrorSettingsToLocalStorage = (settings) => {
  if (typeof window === 'undefined' || !settings) {
    return;
  }

  Object.entries(ACCOUNT_SETTING_STORAGE_MAP).forEach(([settingsKey, storageKey]) => {
    const value = settings[settingsKey];
    if (value === null || value === undefined || value === '') {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(storageKey, String(value));
  });
};

const getBrowserApiBaseUrl = () => {
  if (typeof window === 'undefined') {
    return '/api';
  }

  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && configured.trim()) {
    return configured;
  }

  return '/api';
};

const requestSettingsWithFallback = async (requestConfig) => {
  const triedBaseUrls = new Set();

  try {
    triedBaseUrls.add(String(api.defaults.baseURL || ''));
    return await api.request(requestConfig);
  } catch (primaryError) {
    if (typeof window === 'undefined') {
      throw primaryError;
    }

    const token = getStoredToken();
    if (!token) {
      throw primaryError;
    }

    const fallbackBaseUrls = [
      ...SETTINGS_FALLBACK_API_URLS,
      `${window.location.origin}/api`
    ].filter(Boolean);

    let lastError = primaryError;

    for (const baseURL of fallbackBaseUrls) {
      if (triedBaseUrls.has(baseURL)) {
        continue;
      }
      triedBaseUrls.add(baseURL);

      const fallbackClient = axios.create({
        baseURL,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      try {
        return await fallbackClient.request(requestConfig);
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    throw lastError;
  }
};

// API base URL - points directly to backend
const API_BASE_URL = typeof window !== 'undefined'
  ? getBrowserApiBaseUrl()
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
  const token = getStoredToken();
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
      if (typeof window !== 'undefined') {
        clearStoredAuth();
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
      storeToken(response.data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user));
    }
    return response.data;
  },

  register: async (username, email, password) => {
    const response = await api.post('/auth/register', { username, email, password });
    if (response.data.token && typeof window !== 'undefined') {
      storeToken(response.data.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data.user));
    }
    return response.data;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      clearStoredAuth();
      window.location.href = '/login';
    }
  },

  deleteAccount: async (password) => {
    const response = await api.delete('/auth/me', {
      data: { password }
    });

    if (typeof window !== 'undefined') {
      clearStoredAuth();
      window.location.href = '/login';
    }

    return response.data;
  },

  getCurrentUser: () => {
    if (typeof window === 'undefined') return null;
    const user = localStorage.getItem(USER_STORAGE_KEY);
    return user ? JSON.parse(user) : null;
  },

  isAuthenticated: () => {
    if (typeof window === 'undefined') return false;
    return !!getStoredToken();
  },

  getSettings: async () => {
    const response = await requestSettingsWithFallback({
      method: 'get',
      url: '/auth/settings'
    });
    return response.data;
  },

  updateSettings: async (settings) => {
    const response = await requestSettingsWithFallback({
      method: 'put',
      url: '/auth/settings',
      data: settings
    });
    if (response.data?.settings) {
      mirrorSettingsToLocalStorage(response.data.settings);
    }
    return response.data;
  },

  syncSettingsToLocalStorage: async () => {
    const response = await requestSettingsWithFallback({
      method: 'get',
      url: '/auth/settings'
    });
    if (response.data?.settings) {
      mirrorSettingsToLocalStorage(response.data.settings);
    }
    return response.data;
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

  create: async (peptideData) => {
    const response = await api.post('/peptides', peptideData);
    return response.data;
  },

  update: async (id, peptideData) => {
    const response = await api.put(`/peptides/${id}`, peptideData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/peptides/${id}`);
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

  searchCatalog: async (query) => {
    const response = await api.get('/supplements/catalog/search', {
      params: { query }
    });
    return response.data;
  },

  lookupBarcode: async (code) => {
    const response = await api.get(`/supplements/catalog/barcode/${code}`);
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
  },

  deleteLog: async (id, logId) => {
    const response = await api.delete(`/supplements/${id}/logs/${logId}`);
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
  },

  coach: async (payload) => {
    const response = await api.post('/ai/blood-results-coach', payload);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/blood-results/${id}`);
    return response.data;
  },

  extractDocument: async (file) => {
    const response = await api.post('/ai/extract-blood-panel', file, {
      headers: {
        'Content-Type': file?.type || (file?.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
        'X-File-Name': encodeURIComponent(file?.name || 'upload')
      },
      timeout: 180000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
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
  getFrequentFoods: async (limit = 20, mealType) => {
    const response = await api.get('/meals/frequent-foods', {
      params: { limit, meal_type: mealType }
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

export const food = {
  search: async (query, config = {}) => {
    const { params, ...requestConfig } = config;
    const response = await api.get('/food/search', {
      ...requestConfig,
      params: {
        ...(params || {}),
        query
      }
    });
    return response.data;
  },

  lookupBarcode: async (code, config = {}) => {
    const response = await api.get(`/food/barcode/${code}`, config);
    return response.data;
  },

  log: async (foodData) => {
    const response = await api.post('/food/log', foodData);
    return response.data;
  },

  saveToLibrary: async (foodData) => {
    const response = await api.post('/food/library', foodData);
    return response.data;
  },

  getLibrary: async (limit = 20) => {
    const response = await api.get('/food/library', {
      params: { limit }
    });
    return response.data;
  },

  updateLibraryItem: async (id, foodData) => {
    const response = await api.put(`/food/library/${id}`, foodData);
    return response.data;
  },

  deleteLibraryItem: async (id) => {
    const response = await api.delete(`/food/library/${id}`);
    return response.data;
  },

  getLogs: async (date) => {
    const response = await api.get('/food/log', {
      params: date ? { date } : {}
    });
    return response.data;
  },

  deleteLog: async (id) => {
    const response = await api.delete(`/food/log/${id}`);
    return response.data;
  }
};

export const ai = {
  scanNutritionLabel: async (base64Image) => {
    const response = await api.post('/ai/scan-nutrition-label', { image: base64Image });
    return response.data;
  },

  scanSupplementLabel: async (base64Image) => {
    const response = await api.post('/ai/scan-supplement-label', { image: base64Image });
    return response.data;
  }
};

export default api;
