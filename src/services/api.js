import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://ckk-art-backend.loca.lt/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Authentication
export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },
  
  verify: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },
  
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }
};

// Artworks
export const artworksAPI = {
  getAll: async () => {
    const response = await api.get('/artworks');
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/artworks/${id}`);
    return response.data;
  },
  
  create: async (formData) => {
    const response = await api.post('/artworks', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  
  update: async (id, formData) => {
    const response = await api.put(`/artworks/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  
  delete: async (id) => {
    const response = await api.delete(`/artworks/${id}`);
    return response.data;
  }
};

export default api;
