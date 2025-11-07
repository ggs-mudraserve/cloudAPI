import React, { useState } from 'react';
import { whatsappNumbersAPI } from '../services/whatsappNumbers';

const AddNumberModal = ({ onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    number: '',
    display_name: '',
    phone_number_id: '',
    waba_id: '',
    app_id: '',
    app_secret: '',
    access_token: '',
    system_prompt: 'You are a helpful assistant.'
  });

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setTestResult(null); // Clear test result when form changes
  };

  const handleTestConnection = async () => {
    if (!formData.phone_number_id || !formData.access_token) {
      setError('Phone Number ID and Access Token are required');
      return;
    }

    try {
      setTesting(true);
      setError('');
      setTestResult(null);

      const result = await whatsappNumbersAPI.testConnection(
        formData.phone_number_id,
        formData.access_token
      );

      if (result.success) {
        setTestResult({
          success: true,
          data: result.data
        });

        // Auto-fill display name if not provided
        if (!formData.display_name && result.data.verified_name) {
          setFormData((prev) => ({
            ...prev,
            display_name: result.data.verified_name
          }));
        }
      } else {
        setTestResult({
          success: false,
          error: result.message || 'Connection test failed'
        });
      }
    } catch (err) {
      console.error('Test connection error:', err);
      setTestResult({
        success: false,
        error: err.response?.data?.message || 'Connection test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!testResult || !testResult.success) {
      setError('Please test the connection first');
      return;
    }

    if (!formData.number) {
      setError('WhatsApp number is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      await whatsappNumbersAPI.add(formData);
      onSuccess();
    } catch (err) {
      console.error('Add number error:', err);
      setError(err.response?.data?.message || 'Failed to add WhatsApp number');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  Add WhatsApp Number
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Connect a new WhatsApp Business number to your account
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-800">{error}</div>
                </div>
              )}

              {testResult && testResult.success && (
                <div className="mb-4 rounded-md bg-green-50 p-4">
                  <div className="text-sm text-green-800">
                    ✓ Connection successful! You can now save this number.
                  </div>
                  {testResult.data && (
                    <div className="mt-2 text-xs text-green-700">
                      <div>Verified Name: {testResult.data.verified_name}</div>
                      <div>Quality: {testResult.data.quality_rating}</div>
                      <div>Tier: {testResult.data.tier}</div>
                    </div>
                  )}
                </div>
              )}

              {testResult && !testResult.success && (
                <div className="mb-4 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-800">
                    ✗ {testResult.error}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="phone_number_id"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Phone Number ID *
                  </label>
                  <input
                    type="text"
                    name="phone_number_id"
                    id="phone_number_id"
                    required
                    value={formData.phone_number_id}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="123456789012345"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get from Meta Developer Console → WhatsApp → API Setup
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="waba_id"
                    className="block text-sm font-medium text-gray-700"
                  >
                    WABA ID (WhatsApp Business Account ID) *
                  </label>
                  <input
                    type="text"
                    name="waba_id"
                    id="waba_id"
                    required
                    value={formData.waba_id}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="123456789012345"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get from Meta Developer Console → WhatsApp → Configuration → Business Account ID
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="app_id"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Meta App ID (Optional)
                  </label>
                  <input
                    type="text"
                    name="app_id"
                    id="app_id"
                    value={formData.app_id}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="123456789012345"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get from Meta App Dashboard → Settings → Basic
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="app_secret"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Meta App Secret (Optional)
                  </label>
                  <input
                    type="password"
                    name="app_secret"
                    id="app_secret"
                    value={formData.app_secret}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono text-xs"
                    placeholder="Enter your Meta App Secret"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for webhook signature verification - Click "Show" in Meta App Dashboard → Settings → Basic
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="access_token"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Access Token *
                  </label>
                  <textarea
                    name="access_token"
                    id="access_token"
                    required
                    rows={3}
                    value={formData.access_token}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono text-xs"
                    placeholder="EAAxxxxxxxxxxxxx"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>

                <div className="border-t pt-4">
                  <div>
                    <label
                      htmlFor="number"
                      className="block text-sm font-medium text-gray-700"
                    >
                      WhatsApp Number *
                    </label>
                    <input
                      type="text"
                      name="number"
                      id="number"
                      required
                      value={formData.number}
                      onChange={handleChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="919876543210"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Format: Country code + number (e.g., 919876543210)
                    </p>
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor="display_name"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Display Name
                    </label>
                    <input
                      type="text"
                      name="display_name"
                      id="display_name"
                      value={formData.display_name}
                      onChange={handleChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="My Business"
                    />
                  </div>

                  <div className="mt-4">
                    <label
                      htmlFor="system_prompt"
                      className="block text-sm font-medium text-gray-700"
                    >
                      System Prompt
                    </label>
                    <textarea
                      name="system_prompt"
                      id="system_prompt"
                      rows={3}
                      value={formData.system_prompt}
                      onChange={handleChange}
                      className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Instructions for the AI assistant when replying to messages
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                disabled={saving || !testResult || !testResult.success}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Number'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddNumberModal;
