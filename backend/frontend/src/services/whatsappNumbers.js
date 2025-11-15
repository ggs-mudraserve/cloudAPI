import api from './api';

export const whatsappNumbersAPI = {
  // Test connection to WhatsApp Cloud API
  testConnection: async (phoneNumberId, accessToken) => {
    const response = await api.post('/whatsapp-numbers/test', {
      phone_number_id: phoneNumberId,
      access_token: accessToken
    });
    return response.data;
  },

  // List all WhatsApp numbers
  list: async () => {
    const response = await api.get('/whatsapp-numbers');
    return response.data;
  },

  // Get single WhatsApp number
  get: async (id) => {
    const response = await api.get(`/whatsapp-numbers/${id}`);
    return response.data;
  },

  // Add new WhatsApp number
  add: async (numberData) => {
    const response = await api.post('/whatsapp-numbers', numberData);
    return response.data;
  },

  // Update WhatsApp number (system prompt)
  update: async (id, systemPrompt) => {
    const response = await api.put(`/whatsapp-numbers/${id}`, {
      system_prompt: systemPrompt
    });
    return response.data;
  },

  // Delete WhatsApp number
  delete: async (id) => {
    const response = await api.delete(`/whatsapp-numbers/${id}`);
    return response.data;
  },

  // Sync WhatsApp business profile
  syncProfile: async (id) => {
    const response = await api.post(`/whatsapp-numbers/${id}/sync-profile`);
    return response.data;
  }
};
