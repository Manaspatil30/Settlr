import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Attach JWT token to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors globally
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('token');
    }
    if (!error.response) {
      error.message = 'No internet connection. Please check your network.';
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
export const authAPI = {
  register: (data)  => api.post('/auth/register', data),
  login:    (data)  => api.post('/auth/login', data),
  logout:   ()      => api.post('/auth/logout'),
  me:       ()      => api.get('/auth/me'),
};

// ─────────────────────────────────────────
// USERS
// ─────────────────────────────────────────
export const usersAPI = {
  search:        (q)    => api.get(`/users/search?q=${q}`),
  updateProfile: (data) => api.put('/users/profile', data),
  savePushToken: (token) => api.put('/users/profile', { fcm_token: token }), // ← ADD
};

// ─────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────
export const transactionsAPI = {
  create:  (data) => api.post('/transactions/create', data),
  getAll:  ()     => api.get('/transactions'),
};

// ─────────────────────────────────────────
// SPLITS
// ─────────────────────────────────────────
export const splitsAPI = {
  getPending: ()              => api.get('/splits/pending'),
  accept:     (id)            => api.put(`/splits/${id}/accept`),
  payLater:   (id, due_date)  => api.put(`/splits/${id}/pay-later`, { due_date }),
  decline:    (id, reason)    => api.put(`/splits/${id}/decline`, { reason }),
  createPaymentIntent: (id)   => api.post('/stripe/payment-intent', {split_id: id})
};

// ─────────────────────────────────────────
// DEBTS
// ─────────────────────────────────────────
export const debtsAPI = {
  getAll:    () => api.get('/debts'),
  getUpcoming: () => api.get('/debts/upcoming'),
  settle:    (id) => api.put(`/debts/${id}/settle`),
  createPaymentIntent: (id) => api.post('/stripe/payment-intent', { debt_id: id }),
};

// ─────────────────────────────────────────
// STRIPE
// ─────────────────────────────────────────
export const stripeAPI = {
  connect:       () => api.post('/stripe/connect'),
  getOnboarding: () => api.get('/stripe/onboarding'),
  getStatus:     () => api.get('/stripe/status'),
};

export default api;
