import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data)
};

export const machineAPI = {
  getAll: () => api.get('/machines'),
  getById: (id) => api.get(`/machines/${id}`),
  create: (data) => api.post('/machines', data),
  update: (id, data) => api.put(`/machines/${id}`, data),  // ADD THIS
  delete: (id) => api.delete(`/machines/${id}`),  // ADD THIS
  getMyMachines: () => api.get('/machines/my-machines'),  // ADD THIS
};

export const uploadAPI = {
  uploadImages: async (files) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    
    return api.post('/upload/images', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};

export const rentalAPI = {
  getAll: () => api.get('/rentals'),
  create: (data) => api.post('/rentals', data),
  updateStatus: (id, status) => api.patch(`/rentals/${id}/status`, { status }),  // ADD THIS
  complete: (id) => api.patch(`/rentals/${id}/complete`),  // ADD THIS
};

export const userAPI = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data)
};

export default api;
