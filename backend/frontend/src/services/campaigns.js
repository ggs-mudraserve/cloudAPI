import api from './api';

export const campaignsAPI = {
  // List all campaigns with optional filters
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.whatsapp_number_id) params.append('whatsapp_number_id', filters.whatsapp_number_id);
    if (filters.status) params.append('status', filters.status);

    const response = await api.get(`/campaigns?${params.toString()}`);
    return response.data;
  },

  // Get single campaign
  get: async (id) => {
    const response = await api.get(`/campaigns/${id}`);
    return response.data;
  },

  // Create campaign with CSV file
  create: async (formData) => {
    const response = await api.post('/campaigns', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  // Delete campaign
  delete: async (id) => {
    const response = await api.delete(`/campaigns/${id}`);
    return response.data;
  },

  // Stop/pause campaign
  stop: async (id) => {
    const response = await api.patch(`/campaigns/${id}/stop`);
    return response.data;
  },

  // Resume paused campaign
  resume: async (id) => {
    const response = await api.patch(`/campaigns/${id}/resume`);
    return response.data;
  },

  // Retry all failed messages in a campaign
  retryFailed: async (id) => {
    const response = await api.post(`/campaigns/${id}/retry-failed`);
    return response.data;
  },

  // Get campaign statistics
  getStats: async () => {
    const response = await api.get('/campaigns/stats');
    return response.data;
  },

  // Get template-level statistics for a campaign
  getTemplateStats: async (id) => {
    const response = await api.get(`/campaigns/${id}/template-stats`);
    return response.data;
  }
};
