import React, { useState, useEffect } from 'react';
import { templatesAPI } from '../services/templates';
import { whatsappNumbersAPI } from '../services/whatsappNumbers';
import TemplateHistoryModal from '../components/TemplateHistoryModal';

const Templates = () => {
  const [templates, setTemplates] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncingNumberId, setSyncingNumberId] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [historyModal, setHistoryModal] = useState({ show: false, template: null });

  // Filters
  const [selectedNumber, setSelectedNumber] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showQuarantined, setShowQuarantined] = useState(false);

  useEffect(() => {
    loadNumbers();
    loadTemplates();
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [selectedNumber, selectedCategory, showQuarantined]);

  const loadNumbers = async () => {
    try {
      const result = await whatsappNumbersAPI.list();
      setNumbers(result.data || []);
    } catch (err) {
      console.error('Failed to load numbers:', err);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError('');

      const filters = {};
      if (selectedNumber) filters.whatsapp_number_id = selectedNumber;
      if (selectedCategory) filters.category = selectedCategory;
      if (showQuarantined) filters.is_quarantined = true;

      const result = await templatesAPI.list(filters);
      setTemplates(result.data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    try {
      setSyncing(true);
      setError('');
      setSuccessMessage('');

      const result = await templatesAPI.syncAll();

      if (result.success) {
        setSuccessMessage(
          `Synced ${result.data.totals.total} templates. ` +
          `Inserted: ${result.data.totals.inserted}, ` +
          `Updated: ${result.data.totals.updated}, ` +
          `Quarantined: ${result.data.totals.quarantined}`
        );
        loadTemplates();
      }
    } catch (err) {
      console.error('Sync all failed:', err);
      setError(err.response?.data?.message || 'Failed to sync templates');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncNumber = async (numberId) => {
    try {
      setSyncingNumberId(numberId);
      setError('');
      setSuccessMessage('');

      const result = await templatesAPI.syncByNumber(numberId);

      if (result.success) {
        setSuccessMessage(
          `Synced ${result.data.total} templates. ` +
          `Inserted: ${result.data.inserted}, ` +
          `Updated: ${result.data.updated}`
        );
        loadTemplates();
      }
    } catch (err) {
      console.error('Sync number failed:', err);
      setError(err.response?.data?.message || 'Failed to sync templates');
    } finally {
      setSyncingNumberId(null);
    }
  };

  const handleUnquarantine = async (template) => {
    if (template.category !== 'UTILITY') {
      alert('Can only un-quarantine UTILITY templates');
      return;
    }

    if (!confirm(`Un-quarantine template "${template.name}"?`)) {
      return;
    }

    try {
      await templatesAPI.unquarantine(template.id);
      setSuccessMessage(`Template "${template.name}" un-quarantined successfully`);
      loadTemplates();
    } catch (err) {
      console.error('Un-quarantine failed:', err);
      setError(err.response?.data?.message || 'Failed to un-quarantine template');
    }
  };

  const getCategoryBadge = (category) => {
    const colors = {
      'UTILITY': 'bg-green-100 text-green-800',
      'MARKETING': 'bg-red-100 text-red-800',
      'AUTHENTICATION': 'bg-yellow-100 text-yellow-800'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[category] || 'bg-gray-100 text-gray-800'}`}>
        {category}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const colors = {
      'APPROVED': 'bg-green-100 text-green-800',
      'PENDING': 'bg-yellow-100 text-yellow-800',
      'REJECTED': 'bg-red-100 text-red-800'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  if (loading && templates.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your WhatsApp message templates
              </p>
            </div>
            <button
              onClick={handleSyncAll}
              disabled={syncing || numbers.length === 0}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Syncing...
                </>
              ) : (
                <>
                  <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                  </svg>
                  Sync All
                </>
              )}
            </button>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 rounded-md bg-green-50 p-4">
            <div className="text-sm text-green-800">{successMessage}</div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 bg-white shadow rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WhatsApp Number
              </label>
              <select
                value={selectedNumber}
                onChange={(e) => setSelectedNumber(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">All Numbers</option>
                {numbers.map((num) => (
                  <option key={num.id} value={num.id}>
                    {num.display_name || num.number}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">All Categories</option>
                <option value="UTILITY">UTILITY</option>
                <option value="MARKETING">MARKETING</option>
                <option value="AUTHENTICATION">AUTHENTICATION</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showQuarantined}
                  onChange={(e) => setShowQuarantined(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Show Quarantined Only</span>
              </label>
            </div>

            <div className="flex items-end">
              <button
                onClick={loadTemplates}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Templates List */}
        {templates.length === 0 ? (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No templates</h3>
            <p className="mt-1 text-sm text-gray-500">
              {numbers.length === 0
                ? 'Add a WhatsApp number first, then sync templates.'
                : 'Click "Sync All" to fetch templates from WhatsApp.'}
            </p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {templates.map((template) => (
                <li key={template.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-900">
                          {template.name}
                        </h3>
                        <div className="ml-3 flex space-x-2">
                          {getCategoryBadge(template.category)}
                          {getStatusBadge(template.status)}
                          {template.is_quarantined && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                              ⚠️ Quarantined
                            </span>
                          )}
                          {!template.is_active && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Number:</span>{' '}
                          {template.whatsapp_numbers?.display_name || template.whatsapp_numbers?.number}
                        </div>
                        <div>
                          <span className="font-medium">Language:</span> {template.language}
                        </div>
                        <div>
                          <span className="font-medium">Last Synced:</span>{' '}
                          {new Date(template.last_synced).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="ml-6 flex space-x-2">
                      <button
                        onClick={() => setHistoryModal({ show: true, template })}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        History
                      </button>
                      {template.is_quarantined && template.category === 'UTILITY' && (
                        <button
                          onClick={() => handleUnquarantine(template)}
                          className="inline-flex items-center px-3 py-2 border border-green-300 text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50"
                        >
                          Un-quarantine
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Per-Number Sync Section */}
        {numbers.length > 0 && (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Sync by Number</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {numbers.map((number) => (
                <div key={number.id} className="bg-white shadow rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        {number.display_name || number.number}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">{number.number}</p>
                    </div>
                    <button
                      onClick={() => handleSyncNumber(number.id)}
                      disabled={syncingNumberId === number.id}
                      className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none disabled:opacity-50"
                    >
                      {syncingNumberId === number.id ? 'Syncing...' : 'Sync'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* History Modal */}
      {historyModal.show && (
        <TemplateHistoryModal
          template={historyModal.template}
          onClose={() => setHistoryModal({ show: false, template: null })}
        />
      )}
    </div>
  );
};

export default Templates;
