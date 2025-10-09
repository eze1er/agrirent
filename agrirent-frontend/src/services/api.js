import axios from "axios";

const API_URL = "http://localhost:3001/api";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth API
export const authAPI = {
  register: (data) => api.post("/auth/register", data),
  login: (data) => api.post("/auth/login", data),
};

// Machine API ✅ THIS WAS MISSING!
export const machineAPI = {
  getAll: () => api.get("/machines"),
  getById: (id) => api.get(`/machines/${id}`),
  create: (data) => api.post("/machines", data),
  update: (id, data) => api.put(`/machines/${id}`, data),
  delete: (id) => api.delete(`/machines/${id}`),
  getMyMachines: () => api.get("/machines/my-machines"),
};

// Rental API
export const rentalAPI = {
  getAll: () => api.get("/rentals"),
  create: (data) => api.post("/rentals", data),
  updateStatus: (id, data) => api.patch(`/rentals/${id}/status`, data),
  complete: (id) => api.patch(`/rentals/${id}/complete`), // ✅ ADD THIS
  submitReview: (id, reviewData) => api.post(`/rentals/${id}/review`, reviewData),
  updateReview: (id, reviewData) => api.put(`/rentals/${id}/review`, reviewData),
  getReviewsByMachine: (machineId) => api.get(`/rentals/machine/${machineId}/reviews`),
};
// Upload API
export const uploadAPI = {
  uploadImages: async (files) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("images", file);
    });

    return api.post("/upload/images", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
  },
};

// User API
export const userAPI = {
  getProfile: () => api.get("/users/profile"),
  updateProfile: (data) => api.put("/users/profile", data),
};

export default api;
