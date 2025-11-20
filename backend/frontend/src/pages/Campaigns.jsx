import React, { useState, useEffect } from 'react';
import { campaignsAPI } from '../services/campaigns';
import { whatsappNumbersAPI } from '../services/whatsappNumbers';
import { templatesAPI } from '../services/templates';
import CampaignAnalytics from '../components/CampaignAnalytics';
import { supabase } from '../config/supabase';

const Campaigns = () => {
  const [campaigns, setCampaigns] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [templateStats, setTemplateStats] = useState(null);
  const [loadingTemplateStats, setLoadingTemplateStats] = useState(false);
  const [showTemplateBreakdown, setShowTemplateBreakdown] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    whatsapp_number_id: '',
    selected_templates: [],
    csv_file: null,
    is_scheduled: false,
    scheduled_start_time: ''
  });

  // Filters
  const [selectedNumber, setSelectedNumber] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [dateFilter, setDateFilter] = useState('today'); // 'today', 'current_month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range based on filter
  const getDateRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (dateFilter === 'today') {
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
      return {
        start_date: today.toISOString(),
        end_date: endOfDay.toISOString()
      };
    } else if (dateFilter === 'current_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      firstDay.setHours(0, 0, 0, 0);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      lastDay.setHours(23, 59, 59, 999);
      return {
        start_date: firstDay.toISOString(),
        end_date: lastDay.toISOString()
      };
    } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
      return {
        start_date: new Date(customStartDate).toISOString(),
        end_date: new Date(customEndDate).toISOString()
      };
    }
    return {};
  };

  useEffect(() => {
    loadNumbers();
    loadCampaigns();
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [selectedNumber, selectedStatus, dateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (formData.whatsapp_number_id) {
      loadTemplates(formData.whatsapp_number_id);
    }
  }, [formData.whatsapp_number_id]);

  // Real-time updates for campaign details modal
  useEffect(() => {
    if (!showDetailsModal || !selectedCampaign) return;

    // Refresh campaign details immediately when modal opens
    refreshCampaignDetails(selectedCampaign.id);

    // Debounce timer for real-time updates (prevent too many refreshes)
    let debounceTimer = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshCampaignDetails(selectedCampaign.id);
      }, 2000); // Refresh at most every 2 seconds
    };

    // Set up real-time subscriptions for this specific campaign
    const campaignChannel = supabase
      .channel(`campaign-details-${selectedCampaign.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns',
          filter: `id=eq.${selectedCampaign.id}`
        },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'send_queue',
          filter: `campaign_id=eq.${selectedCampaign.id}`
        },
        debouncedRefresh
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_status_logs',
          filter: `campaign_id=eq.${selectedCampaign.id}`
        },
        debouncedRefresh
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      campaignChannel.unsubscribe();
    };
  }, [showDetailsModal, selectedCampaign?.id]);

  const refreshCampaignDetails = async (campaignId) => {
    try {
      const result = await campaignsAPI.get(campaignId);
      setSelectedCampaign(result.data);
    } catch (err) {
      console.error('Failed to refresh campaign details:', err);
    }
  };

  const loadNumbers = async () => {
    try {
      const result = await whatsappNumbersAPI.list();
      setNumbers(result.data || []);
    } catch (err) {
      console.error('Failed to load numbers:', err);
    }
  };

  const loadTemplates = async (numberId) => {
    try {
      const result = await templatesAPI.list({
        whatsapp_number_id: numberId,
        is_quarantined: false
      });

      // Filter to show only APPROVED and UTILITY templates
      const eligibleTemplates = (result.data || []).filter(
        t => t.status === 'APPROVED' && t.category === 'UTILITY' && t.is_active
      );

      setTemplates(eligibleTemplates);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      setError('');

      const filters = {};
      if (selectedNumber) filters.whatsapp_number_id = selectedNumber;
      if (selectedStatus) filters.status = selectedStatus;

      // Add date range filters
      const dateRange = getDateRange();
      if (dateRange.start_date) filters.start_date = dateRange.start_date;
      if (dateRange.end_date) filters.end_date = dateRange.end_date;

      const result = await campaignsAPI.list(filters);
      setCampaigns(result.data || []);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && !file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      e.target.value = null;
      return;
    }
    setFormData(prev => ({
      ...prev,
      csv_file: file
    }));
  };

  const handleTemplateToggle = (templateName) => {
    setFormData(prev => ({
      ...prev,
      selected_templates: prev.selected_templates.includes(templateName)
        ? prev.selected_templates.filter(t => t !== templateName)
        : [...prev.selected_templates, templateName]
    }));
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.name.trim()) {
      setError('Campaign name is required');
      return;
    }

    if (!formData.whatsapp_number_id) {
      setError('Please select a WhatsApp number');
      return;
    }

    if (formData.selected_templates.length === 0) {
      setError('Please select at least one template');
      return;
    }

    if (!formData.csv_file) {
      setError('Please upload a CSV file');
      return;
    }

    if (formData.is_scheduled && !formData.scheduled_start_time) {
      setError('Please select a scheduled start time');
      return;
    }

    try {
      setCreating(true);
      setError('');
      setSuccessMessage('');

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('whatsapp_number_id', formData.whatsapp_number_id);
      formDataToSend.append('template_names', JSON.stringify(formData.selected_templates));
      formDataToSend.append('csv', formData.csv_file);
      formDataToSend.append('is_scheduled', formData.is_scheduled);
      if (formData.is_scheduled) {
        formDataToSend.append('scheduled_start_time', new Date(formData.scheduled_start_time).toISOString());
      }

      const result = await campaignsAPI.create(formDataToSend);

      if (result.success) {
        setSuccessMessage(
          `Campaign created successfully! ` +
          `Valid contacts: ${result.data.totalContacts}, ` +
          `Invalid: ${result.data.invalidContactsCount}`
        );

        // Reset form
        setFormData({
          name: '',
          whatsapp_number_id: '',
          selected_templates: [],
          csv_file: null,
          is_scheduled: false,
          scheduled_start_time: ''
        });
        document.getElementById('csv-file-input').value = null;
        setShowCreateForm(false);
        loadCampaigns();
      }
    } catch (err) {
      console.error('Create campaign error:', err);
      setError(err.response?.data?.message || 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCampaign = async (campaignId, campaignName) => {
    if (!confirm(`Delete campaign "${campaignName}"?`)) {
      return;
    }

    try {
      await campaignsAPI.delete(campaignId);
      setSuccessMessage('Campaign deleted successfully');
      loadCampaigns();
    } catch (err) {
      console.error('Delete campaign error:', err);
      setError(err.response?.data?.message || 'Failed to delete campaign');
    }
  };

  const viewCampaignDetails = async (campaignId) => {
    try {
      // Fetch campaign without template stats (fast)
      const result = await campaignsAPI.get(campaignId);
      setSelectedCampaign(result.data);
      setTemplateStats(null);
      setShowTemplateBreakdown(false);
      setShowDetailsModal(true);

      // Setup realtime subscription for live updates
      const channel = supabase
        .channel(`campaign-${campaignId}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'campaigns',
          filter: `id=eq.${campaignId}`
        }, (payload) => {
          console.log('[Realtime] Campaign update received:', payload);
          setSelectedCampaign(prev => ({
            ...prev,
            ...payload.new
          }));
        })
        .subscribe();

      // Store channel for cleanup
      window.__campaignRealtimeChannel = channel;
    } catch (err) {
      console.error('Failed to load campaign details:', err);
      setError(err.response?.data?.message || 'Failed to load campaign details');
    }
  };

  const loadTemplateBreakdown = async () => {
    if (!selectedCampaign) return;

    try {
      setLoadingTemplateStats(true);
      const result = await campaignsAPI.getTemplateStats(selectedCampaign.id);
      setTemplateStats(result.data);
      setShowTemplateBreakdown(true);
    } catch (err) {
      console.error('Failed to load template stats:', err);
      setError(err.response?.data?.message || 'Failed to load template statistics');
    } finally {
      setLoadingTemplateStats(false);
    }
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedCampaign(null);
    setTemplateStats(null);
    setShowTemplateBreakdown(false);

    // Cleanup realtime subscription
    if (window.__campaignRealtimeChannel) {
      supabase.removeChannel(window.__campaignRealtimeChannel);
      window.__campaignRealtimeChannel = null;
    }
  };

  const handleStopCampaign = async (campaignId) => {
    try {
      await campaignsAPI.stop(campaignId);
      setSuccessMessage('Campaign stopped successfully');
      loadCampaigns();
    } catch (err) {
      console.error('Stop campaign error:', err);
      setError(err.response?.data?.message || 'Failed to stop campaign');
    }
  };

  const handleResumeCampaign = async (campaignId) => {
    try {
      await campaignsAPI.resume(campaignId);
      setSuccessMessage('Campaign resumed successfully');
      loadCampaigns();
    } catch (err) {
      console.error('Resume campaign error:', err);
      setError(err.response?.data?.message || 'Failed to resume campaign');
    }
  };

  const handleRetryFailed = async (campaignId) => {
    try {
      const result = await campaignsAPI.retryFailed(campaignId);
      setSuccessMessage(result.message || `${result.retriedCount} failed messages queued for retry`);
      loadCampaigns();

      // Refresh campaign details modal if open
      if (selectedCampaign && selectedCampaign.id === campaignId) {
        const refreshResult = await campaignsAPI.get(campaignId);
        setSelectedCampaign(refreshResult.data);
      }
    } catch (err) {
      console.error('Retry failed messages error:', err);
      setError(err.response?.data?.message || 'Failed to retry messages');
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'scheduled': 'bg-blue-100 text-blue-800',
      'running': 'bg-green-100 text-green-800',
      'paused': 'bg-yellow-100 text-yellow-800',
      'completed': 'bg-gray-100 text-gray-800',
      'failed': 'bg-red-100 text-red-800'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  if (loading && campaigns.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading campaigns...</p>
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
              <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
              <p className="mt-2 text-sm text-gray-600">
                Create and manage WhatsApp bulk messaging campaigns
              </p>
            </div>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              disabled={numbers.length === 0}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {showCreateForm ? 'Cancel' : '+ Create Campaign'}
            </button>
          </div>
        </div>

        {/* Campaign Analytics */}
        <div className="mb-8">
          <CampaignAnalytics
            filters={{
              whatsapp_number_id: selectedNumber,
              status: selectedStatus,
              ...getDateRange()
            }}
          />
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

        {/* Create Campaign Form */}
        {showCreateForm && (
          <div className="mb-8 bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Campaign</h2>
            <form onSubmit={handleCreateCampaign} className="space-y-6">
              {/* Campaign Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Campaign Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Diwali Offers 2024"
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  required
                />
              </div>

              {/* WhatsApp Number */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  WhatsApp Number *
                </label>
                <select
                  name="whatsapp_number_id"
                  value={formData.whatsapp_number_id}
                  onChange={handleInputChange}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  required
                >
                  <option value="">Select WhatsApp Number</option>
                  {numbers.map((num) => (
                    <option key={num.id} value={num.id}>
                      {num.display_name || num.number}
                    </option>
                  ))}
                </select>
              </div>

              {/* Templates Selection */}
              {formData.whatsapp_number_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Templates * (contacts will be distributed evenly)
                  </label>
                  {templates.length === 0 ? (
                    <p className="text-sm text-red-600">
                      No eligible templates found. Please sync templates first.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
                      {templates.map((template) => (
                        <label key={template.id} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={formData.selected_templates.includes(template.name)}
                            onChange={() => handleTemplateToggle(template.name)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <span className="ml-2 text-sm text-gray-700">
                            {template.name} ({template.language})
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* CSV Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  CSV File * (Phone, Variable1, Variable2, ...)
                </label>
                <input
                  id="csv-file-input"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Format: First column is phone (12 digits starting with 91), remaining columns are template variables
                </p>
              </div>

              {/* Scheduling */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="is_scheduled"
                    checked={formData.is_scheduled}
                    onChange={handleInputChange}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Schedule for later</span>
                </label>
              </div>

              {formData.is_scheduled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scheduled Start Time (IST) *
                  </label>
                  <input
                    type="datetime-local"
                    name="scheduled_start_time"
                    value={formData.scheduled_start_time}
                    onChange={handleInputChange}
                    className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    required={formData.is_scheduled}
                  />
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
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
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="running">Running</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option value="today">Today</option>
                <option value="current_month">Current Month</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={loadCampaigns}
                className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Custom Date Range */}
          {dateFilter === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  From Date
                </label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  To Date
                </label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Campaigns List */}
        {campaigns.length === 0 ? (
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
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No campaigns</h3>
            <p className="mt-1 text-sm text-gray-500">
              {numbers.length === 0
                ? 'Add a WhatsApp number first, then create campaigns.'
                : 'Click "Create Campaign" to start your first campaign.'}
            </p>
          </div>
        ) : (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <ul className="divide-y divide-gray-200">
              {campaigns.map((campaign) => (
                <li key={campaign.id} className="px-6 py-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h3 className="text-lg font-medium text-gray-900">
                          {campaign.name}
                        </h3>
                        <div className="ml-3">
                          {getStatusBadge(campaign.status)}
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Number:</span>{' '}
                          {campaign.whatsapp_numbers?.display_name || campaign.whatsapp_numbers?.number}
                        </div>
                        <div>
                          <span className="font-medium">Templates:</span> {campaign.template_names?.join(', ')}
                        </div>
                        <div>
                          <span className="font-medium">Contacts:</span> {campaign.total_contacts}
                          {campaign.invalid_contacts_count > 0 && (
                            <span className="text-red-600"> ({campaign.invalid_contacts_count} invalid)</span>
                          )}
                        </div>
                        <div>
                          <span className="font-medium">Sent/Failed:</span> {campaign.total_sent}/{campaign.total_failed}
                        </div>
                        {campaign.scheduled_start_time && (
                          <div>
                            <span className="font-medium">Scheduled:</span>{' '}
                            {new Date(campaign.scheduled_start_time).toLocaleString()}
                          </div>
                        )}
                        {campaign.start_time && (
                          <div>
                            <span className="font-medium">Started:</span>{' '}
                            {new Date(campaign.start_time).toLocaleString()}
                          </div>
                        )}
                        {campaign.end_time && (
                          <div>
                            <span className="font-medium">Ended:</span>{' '}
                            {new Date(campaign.end_time).toLocaleString()}
                          </div>
                        )}
                        {campaign.pause_reason && campaign.status === 'paused' && (
                          <div className="col-span-2">
                            <span className="font-medium text-orange-600">Pause Reason:</span>{' '}
                            <span className="text-orange-700">{campaign.pause_reason}</span>
                          </div>
                        )}
                        {campaign.start_time && campaign.end_time && campaign.total_sent > 0 && (
                          <div>
                            <span className="font-medium">Avg Speed:</span>{' '}
                            {(() => {
                              const startTime = new Date(campaign.start_time).getTime();
                              const endTime = new Date(campaign.end_time).getTime();
                              const durationSeconds = (endTime - startTime) / 1000;
                              const avgSpeed = durationSeconds > 0 ? (campaign.total_sent / durationSeconds).toFixed(2) : '0';
                              return `${avgSpeed} msg/sec`;
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-6 flex space-x-2">
                      <button
                        onClick={() => viewCampaignDetails(campaign.id)}
                        className="inline-flex items-center px-3 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50"
                      >
                        View Details
                      </button>
                      {campaign.status === 'running' && (
                        <button
                          onClick={() => handleStopCampaign(campaign.id)}
                          className="inline-flex items-center px-3 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-700 bg-white hover:bg-yellow-50"
                        >
                          Stop
                        </button>
                      )}
                      {campaign.status === 'paused' && (
                        <button
                          onClick={() => handleResumeCampaign(campaign.id)}
                          className="inline-flex items-center px-3 py-2 border border-green-300 text-sm font-medium rounded-md text-green-700 bg-white hover:bg-green-50"
                        >
                          Resume
                        </button>
                      )}
                      {(() => {
                        const shouldShowRetry = (campaign.status === 'running' || campaign.status === 'completed' || campaign.status === 'paused') && campaign.total_failed > 0;
                        console.log(`[Campaign ${campaign.name}] Status: ${campaign.status}, Failed: ${campaign.total_failed}, Show Retry: ${shouldShowRetry}`);
                        return shouldShowRetry ? (
                          <button
                            onClick={() => handleRetryFailed(campaign.id)}
                            className="inline-flex items-center px-3 py-2 border border-orange-300 text-sm font-medium rounded-md text-orange-700 bg-white hover:bg-orange-50"
                          >
                            Retry Failed ({campaign.total_failed})
                          </button>
                        ) : null;
                      })()}
                      {(campaign.status === 'scheduled' || campaign.status === 'failed' || campaign.status === 'completed') && (
                        <button
                          onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                          className="inline-flex items-center px-3 py-2 border border-red-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Campaign Details Modal */}
      {showDetailsModal && selectedCampaign && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Campaign Details: {selectedCampaign.name}
              </h3>
              <button
                onClick={closeDetailsModal}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            {/* Live Update Indicator */}
            <div className="mb-4">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                <span className="animate-pulse mr-1">●</span>
                Live Updates Active
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-md font-medium text-gray-900">Campaign Progress</h4>
                <span className="text-sm text-gray-600">
                  {selectedCampaign.total_sent + selectedCampaign.total_failed} / {selectedCampaign.total_contacts} processed
                  {selectedCampaign.total_contacts > 0 && (
                    <span className="ml-1">
                      ({Math.round(((selectedCampaign.total_sent + selectedCampaign.total_failed) / selectedCampaign.total_contacts) * 100)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                <div className="h-full flex">
                  {/* Sent (Green) */}
                  <div
                    className="bg-green-500 flex items-center justify-center text-xs text-white font-semibold transition-all duration-500"
                    style={{
                      width: `${selectedCampaign.total_contacts > 0 ? (selectedCampaign.total_sent / selectedCampaign.total_contacts) * 100 : 0}%`
                    }}
                  >
                    {selectedCampaign.total_sent > 0 && selectedCampaign.total_contacts > 0 &&
                      ((selectedCampaign.total_sent / selectedCampaign.total_contacts) * 100) > 5 &&
                      `${Math.round((selectedCampaign.total_sent / selectedCampaign.total_contacts) * 100)}%`
                    }
                  </div>
                  {/* Failed (Red) */}
                  <div
                    className="bg-red-500 flex items-center justify-center text-xs text-white font-semibold transition-all duration-500"
                    style={{
                      width: `${selectedCampaign.total_contacts > 0 ? (selectedCampaign.total_failed / selectedCampaign.total_contacts) * 100 : 0}%`
                    }}
                  >
                    {selectedCampaign.total_failed > 0 && selectedCampaign.total_contacts > 0 &&
                      ((selectedCampaign.total_failed / selectedCampaign.total_contacts) * 100) > 5 &&
                      `${Math.round((selectedCampaign.total_failed / selectedCampaign.total_contacts) * 100)}%`
                    }
                  </div>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>✓ Sent: {selectedCampaign.total_sent}</span>
                <span>✗ Failed: {selectedCampaign.total_failed}</span>
                <span>⏳ Pending: {selectedCampaign.total_contacts - selectedCampaign.total_sent - selectedCampaign.total_failed}</span>
              </div>
            </div>

            {/* Overall Statistics */}
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-900 mb-3">Overall Statistics</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-50 p-3 rounded">
                  <span className="font-medium text-gray-600">Status:</span>{' '}
                  <span className={`font-semibold ${
                    selectedCampaign.status === 'running' ? 'text-green-600' :
                    selectedCampaign.status === 'paused' ? 'text-yellow-600' :
                    selectedCampaign.status === 'completed' ? 'text-blue-600' :
                    'text-gray-600'
                  }`}>
                    {selectedCampaign.status}
                  </span>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <span className="font-medium text-gray-600">Total Contacts:</span>{' '}
                  <span className="font-semibold">{selectedCampaign.total_contacts}</span>
                </div>
                <div className="bg-green-50 p-3 rounded">
                  <span className="font-medium text-green-700">Sent:</span>{' '}
                  <span className="font-semibold text-green-800">
                    {selectedCampaign.total_sent}
                    {selectedCampaign.total_contacts > 0 && (
                      <span className="text-sm ml-1">
                        ({Math.round((selectedCampaign.total_sent / selectedCampaign.total_contacts) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-blue-50 p-3 rounded">
                  <span className="font-medium text-blue-700">Delivered:</span>{' '}
                  <span className="font-semibold text-blue-800">
                    {selectedCampaign.total_delivered || 0}
                    {selectedCampaign.total_contacts > 0 && (
                      <span className="text-sm ml-1">
                        ({Math.round(((selectedCampaign.total_delivered || 0) / selectedCampaign.total_contacts) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-indigo-50 p-3 rounded">
                  <span className="font-medium text-indigo-700">Read:</span>{' '}
                  <span className="font-semibold text-indigo-800">
                    {selectedCampaign.total_read || 0}
                    {selectedCampaign.total_sent > 0 && (
                      <span className="text-sm ml-1">
                        ({Math.round(((selectedCampaign.total_read || 0) / selectedCampaign.total_sent) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-purple-50 p-3 rounded">
                  <span className="font-medium text-purple-700">Replied:</span>{' '}
                  <span className="font-semibold text-purple-800">
                    {selectedCampaign.total_replied || 0}
                    {selectedCampaign.total_sent > 0 && (
                      <span className="text-sm ml-1">
                        ({Math.round(((selectedCampaign.total_replied || 0) / selectedCampaign.total_sent) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-red-50 p-3 rounded">
                  <span className="font-medium text-red-700">Failed:</span>{' '}
                  <span className="font-semibold text-red-800">
                    {selectedCampaign.total_failed}
                    {selectedCampaign.total_contacts > 0 && (
                      <span className="text-sm ml-1">
                        ({Math.round((selectedCampaign.total_failed / selectedCampaign.total_contacts) * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              {!showTemplateBreakdown && (
                <button
                  onClick={loadTemplateBreakdown}
                  disabled={loadingTemplateStats}
                  className="inline-flex items-center px-4 py-2 border border-blue-300 text-sm font-medium rounded-md text-blue-700 bg-white hover:bg-blue-50 disabled:opacity-50"
                >
                  {loadingTemplateStats ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-blue-700" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading Template Breakdown...
                    </>
                  ) : (
                    <>📊 View Template Breakdown</>
                  )}
                </button>
              )}

              {/* Retry Failed Button */}
              {selectedCampaign.total_failed > 0 && (
                <button
                  onClick={() => handleRetryFailed(selectedCampaign.id)}
                  className="inline-flex items-center px-4 py-2 border border-orange-300 text-sm font-medium rounded-md text-orange-700 bg-white hover:bg-orange-50"
                >
                  🔄 Retry Failed ({selectedCampaign.total_failed})
                </button>
              )}
            </div>

            {/* Template Breakdown Table */}
            {showTemplateBreakdown && templateStats && Object.keys(templateStats).length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-md font-medium text-gray-900">Template-wise Breakdown</h4>
                  <button
                    onClick={() => setShowTemplateBreakdown(false)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Hide
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Template Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sent
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Delivered
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Read
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Replied
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Failed
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {Object.entries(templateStats).map(([templateName, stats]) => (
                        <tr key={templateName}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {templateName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {stats.total}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {stats.sent}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600">
                            {stats.delivered}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-indigo-600">
                            {stats.read}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-600">
                            {stats.replied}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {stats.failed}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeDetailsModal}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
