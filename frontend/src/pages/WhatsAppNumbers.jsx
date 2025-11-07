import React, { useState, useEffect } from 'react';
import { whatsappNumbersAPI } from '../services/whatsappNumbers';
import AddNumberModal from '../components/AddNumberModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

const WhatsAppNumbers = () => {
  const [numbers, setNumbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState({ show: false, number: null });
  const [error, setError] = useState('');
  const [syncingId, setSyncingId] = useState(null);

  useEffect(() => {
    loadNumbers();
  }, []);

  const loadNumbers = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await whatsappNumbersAPI.list();
      setNumbers(result.data || []);
    } catch (err) {
      console.error('Failed to load numbers:', err);
      setError('Failed to load WhatsApp numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSuccess = () => {
    setShowAddModal(false);
    loadNumbers();
  };

  const handleDelete = async () => {
    try {
      await whatsappNumbersAPI.delete(deleteModal.number.id);
      setDeleteModal({ show: false, number: null });
      loadNumbers();
    } catch (err) {
      console.error('Failed to delete number:', err);
      alert('Failed to delete WhatsApp number');
    }
  };

  const handleSyncProfile = async (numberId) => {
    try {
      setSyncingId(numberId);
      const response = await whatsappNumbersAPI.syncProfile(numberId);
      loadNumbers();

      // Show the message from backend (includes name_status info)
      alert(response.message || 'Profile synced successfully!');
    } catch (err) {
      console.error('Failed to sync profile:', err);
      alert(err.response?.data?.message || 'Failed to sync profile');
    } finally {
      setSyncingId(null);
    }
  };

  const getStatusBadge = (isActive) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Inactive
      </span>
    );
  };

  const getTierBadge = (tier) => {
    const colors = {
      'TIER_1000': 'bg-purple-100 text-purple-800',
      'TIER_10K': 'bg-blue-100 text-blue-800',
      'TIER_100K': 'bg-indigo-100 text-indigo-800',
      'TIER_UNLIMITED': 'bg-green-100 text-green-800'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[tier] || 'bg-gray-100 text-gray-800'}`}>
        {tier || 'Unknown'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">WhatsApp Numbers</h1>
              <p className="mt-2 text-sm text-gray-600">
                Manage your connected WhatsApp Business numbers
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <svg
                className="-ml-1 mr-2 h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
              Add Number
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}

        {/* Numbers List */}
        {numbers.length === 0 ? (
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
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No WhatsApp numbers</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your first WhatsApp Business number.
            </p>
            <div className="mt-6">
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
              >
                Add Number
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {numbers.map((number) => (
                <li key={number.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-900">
                          {number.display_name || number.number}
                        </h3>
                        <div className="ml-3">{getStatusBadge(number.is_active)}</div>
                        {number.tier && <div className="ml-2">{getTierBadge(number.tier)}</div>}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Number:</span> {number.number}
                        </div>
                        <div>
                          <span className="font-medium">Phone Number ID:</span>{' '}
                          {number.phone_number_id}
                        </div>
                        <div>
                          <span className="font-medium">Send Rate:</span>{' '}
                          {number.max_send_rate_per_sec} msg/sec
                        </div>
                        {number.quality_rating && (
                          <div>
                            <span className="font-medium">Quality:</span> {number.quality_rating}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-6 flex space-x-3">
                      <button
                        onClick={() => handleSyncProfile(number.id)}
                        disabled={syncingId === number.id}
                        className="inline-flex items-center px-3 py-2 border border-indigo-300 text-sm font-medium rounded-md text-indigo-700 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {syncingId === number.id ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Syncing...
                          </>
                        ) : (
                          <>
                            <svg className="-ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Sync Profile
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteModal({ show: true, number })}
                        className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddNumberModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {deleteModal.show && (
        <DeleteConfirmModal
          number={deleteModal.number}
          onClose={() => setDeleteModal({ show: false, number: null })}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
};

export default WhatsAppNumbers;
