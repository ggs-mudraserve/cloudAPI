import React, { useState, useEffect } from 'react';
import api from '../services/api';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [formData, setFormData] = useState({
    model_name: 'gpt-4o-mini',
    api_key: '',
    temperature: 0.7,
    max_tokens: 512
  });
  const [originalApiKey, setOriginalApiKey] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/settings/llm');

      if (res.data?.data) {
        const settings = res.data.data;
        setFormData({
          model_name: settings.model_name || 'gpt-4o-mini',
          api_key: settings.api_key_masked || '',
          temperature: settings.temperature || 0.7,
          max_tokens: settings.max_tokens || 512
        });
        setOriginalApiKey(settings.api_key_masked || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      showMessage('Failed to load settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'temperature' || name === 'max_tokens'
        ? parseFloat(value)
        : value
    }));
  };

  const handleApiKeyFocus = () => {
    // Auto-clear masked value when field is focused
    if (formData.api_key === originalApiKey && formData.api_key.includes('*')) {
      setFormData(prev => ({
        ...prev,
        api_key: ''
      }));
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setMessage(null);

      // Check if API key has been changed from the masked version
      const isStillMasked = formData.api_key === originalApiKey || formData.api_key.includes('*');

      if (isStillMasked || !formData.api_key || formData.api_key.trim() === '') {
        showMessage('Please enter your OpenAI API key (starting with sk-) to test', 'error');
        setTesting(false);
        return;
      }

      if (!formData.api_key.startsWith('sk-')) {
        showMessage('Invalid API key format. OpenAI keys start with "sk-"', 'error');
        setTesting(false);
        return;
      }

      const res = await api.post('/settings/llm/test', {
        api_key: formData.api_key,
        model_name: formData.model_name
      });

      showMessage(`✅ Connection successful! Test response: "${res.data.test_response}"`, 'success');
    } catch (error) {
      console.error('Test connection error:', error);
      showMessage(error.response?.data?.message || 'Connection failed', 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage(null);

      // Check if API key has been changed from the masked version
      const isStillMasked = formData.api_key === originalApiKey || formData.api_key.includes('*');

      if (isStillMasked || !formData.api_key || formData.api_key.trim() === '') {
        showMessage('Please enter your OpenAI API key to save settings', 'error');
        setSaving(false);
        return;
      }

      if (!formData.api_key.startsWith('sk-')) {
        showMessage('Invalid API key format. OpenAI keys start with "sk-"', 'error');
        setSaving(false);
        return;
      }

      const res = await api.post('/settings/llm', formData);

      showMessage('Settings saved successfully!', 'success');

      // Refresh settings to get masked key
      await fetchSettings();

    } catch (error) {
      console.error('Save settings error:', error);
      showMessage(error.response?.data?.message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      {/* Message Banner */}
      {message && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Global LLM Settings */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Global LLM Configuration
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Configure OpenAI settings for auto-reply functionality across all WhatsApp numbers.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAI Model
            </label>
            <select
              name="model_name"
              value={formData.model_name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            >
              <option value="gpt-4o">GPT-4o (Most capable)</option>
              <option value="gpt-4o-mini">GPT-4o Mini (Balanced)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fastest)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Select the model that best fits your needs. GPT-4o Mini is recommended for most use cases.
            </p>
          </div>

          {/* API Key */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAI API Key
            </label>
            <input
              type="password"
              name="api_key"
              value={formData.api_key}
              onChange={handleChange}
              onFocus={handleApiKeyFocus}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="sk-..."
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Your API key is encrypted and securely stored. Get your key from{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 hover:text-indigo-700"
              >
                OpenAI Platform
              </a>
            </p>
          </div>

          {/* Temperature */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Temperature: {formData.temperature}
            </label>
            <input
              type="range"
              name="temperature"
              min="0"
              max="2"
              step="0.1"
              value={formData.temperature}
              onChange={handleChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>More Focused (0)</span>
              <span>Balanced (1)</span>
              <span>More Creative (2)</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max Response Length (tokens)
            </label>
            <input
              type="number"
              name="max_tokens"
              value={formData.max_tokens}
              onChange={handleChange}
              min="50"
              max="2000"
              step="50"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum length of AI responses (1 token ≈ 0.75 words). Recommended: 512
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || saving}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            <button
              type="submit"
              disabled={saving || testing}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* Auto-Reply Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">
          ℹ️ Auto-Reply Information
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>
              <strong>40 Reply Limit:</strong> Each customer can receive up to 40 LLM-generated replies (lifetime limit)
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>
              <strong>Text Messages Only:</strong> Auto-replies only respond to incoming text messages (media messages are skipped)
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>
              <strong>Context Window:</strong> AI uses the last 10 messages per user for context
            </span>
          </li>
          <li className="flex items-start">
            <span className="mr-2">•</span>
            <span>
              <strong>System Prompts:</strong> Each WhatsApp number can have its own custom system prompt (configure in WhatsApp Numbers page)
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
};

export default Settings;
