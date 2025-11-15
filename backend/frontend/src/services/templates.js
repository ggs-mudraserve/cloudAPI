import api from './api';

export const templatesAPI = {
  // List all templates with optional filters
  list: async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.whatsapp_number_id) params.append('whatsapp_number_id', filters.whatsapp_number_id);
    if (filters.category) params.append('category', filters.category);
    if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
    if (filters.is_quarantined !== undefined) params.append('is_quarantined', filters.is_quarantined);

    const response = await api.get(`/templates?${params.toString()}`);
    return response.data;
  },

  // Get single template
  get: async (id) => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },

  // Sync all templates
  syncAll: async () => {
    const response = await api.post('/templates/sync-all');
    return response.data;
  },

  // Sync templates for specific number
  syncByNumber: async (numberId) => {
    const response = await api.post(`/templates/sync/${numberId}`);
    return response.data;
  },

  // Un-quarantine template
  unquarantine: async (id) => {
    const response = await api.patch(`/templates/${id}/unquarantine`);
    return response.data;
  },

  // Get template history
  getHistory: async (id) => {
    const response = await api.get(`/templates/${id}/history`);
    return response.data;
  },

  // Get template statistics
  getStats: async () => {
    const response = await api.get('/templates/stats');
    return response.data;
  }
};
