import axios from 'axios';

const API_BASE_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

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
  },

  // Admin-only: returns all artworks regardless of status
  getAllAdmin: async () => {
    const response = await api.get('/admin/artworks');
    return response.data;
  },

  updateStatus: async (id, status) => {
    const response = await api.patch(`/admin/artworks/${id}/status`, { status });
    return response.data;
  },

  updatePrice: async (id, priceUsd, fxRateUsed = null, multiplierUsed = null) => {
    const body = { price_usd: priceUsd };
    if (fxRateUsed !== null) body.fx_rate_used = fxRateUsed;
    if (multiplierUsed !== null) body.multiplier_used = multiplierUsed;
    const response = await api.put(`/artworks/${id}/price`, body);
    return response.data;
  }
};

// Categories
export const categoriesAPI = {
  getAll: async () => {
    const response = await api.get('/categories');
    return response.data;
  },

  getPublic: async () => {
    const response = await api.get('/categories?publicOnly=true');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/categories', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  }
};

// About Page
export const aboutAPI = {
  get: async () => {
    const response = await api.get('/about');
    return response.data;
  },
  
  update: async (data) => {
    const response = await api.put('/about', data);
    return response.data;
  },
  
  uploadImage: async (imageFile) => {
    const formData = new FormData();
    formData.append('image', imageFile);
    const response = await api.post('/about/upload-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

// Inventory Sync
export const inventorySyncAPI = {
  // workbookFile: File (.xlsx/.xls)
  // imageFiles: { zip: File|null, images: File[] } — both optional
  preview: async (workbookFile, imageFiles = {}) => {
    const formData = new FormData();
    formData.append('file', workbookFile);
    if (imageFiles.zip)    formData.append('imageZip', imageFiles.zip);
    (imageFiles.images || []).forEach(f => formData.append('images', f));
    const response = await api.post('/admin/inventory-sync/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  apply: async (workbookFile, imageFiles = {}) => {
    const formData = new FormData();
    formData.append('file', workbookFile);
    if (imageFiles.zip)    formData.append('imageZip', imageFiles.zip);
    (imageFiles.images || []).forEach(f => formData.append('images', f));
    const response = await api.post('/admin/inventory-sync/apply', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getAdminArtworks: async () => {
    const response = await api.get('/admin/artworks');
    return response.data;
  },
};

// Order Requests (ORD-01 admin viewing + ORD-02 public submission)
export const orderRequestsAPI = {
  // Public: submit a new order request. { name, email, phone?, message?, items: [{ artwork_id, artwork_size_id?, quantity? }] }
  create: async (payload) => {
    const response = await api.post('/order-requests', payload);
    return response.data;
  },

  getAll: async (status = null) => {
    const response = await api.get('/admin/order-requests', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/admin/order-requests/${id}`);
    return response.data;
  },

  updateStatus: async (id, status) => {
    const response = await api.patch(`/admin/order-requests/${id}/status`, { status });
    return response.data;
  },
};

// ARCH-INV-04: Admin Inventory Read-Only Views
export const inventoryAPI = {
  getShipments: async () => {
    const response = await api.get('/admin/shipments');
    return response.data;
  },

  getShipmentById: async (id) => {
    const response = await api.get(`/admin/shipments/${id}`);
    return response.data;
  },

  getPhysicalInventory: async () => {
    const response = await api.get('/admin/physical-inventory');
    return response.data;
  },

  getInventoryMovements: async (physicalInventoryId = null) => {
    const response = await api.get('/admin/inventory-movements', {
      params: physicalInventoryId ? { physical_inventory_id: physicalInventoryId } : {},
    });
    return response.data;
  },
};

export default api;
