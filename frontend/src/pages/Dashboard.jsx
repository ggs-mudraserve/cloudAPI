import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { supabase } from '../config/supabase';
import NotificationBell from '../components/NotificationBell';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    whatsappNumbers: 0,
    templates: 0,
    campaigns: 0,
    activeCampaigns: 0,
    totalSent: 0,
    totalFailed: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    setupRealtimeSubscriptions();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Fetch WhatsApp numbers count
      const numbersRes = await api.get('/whatsapp-numbers');
      const numbersCount = numbersRes.data?.data?.length || 0;

      // Fetch templates count
      const templatesRes = await api.get('/templates');
      const templatesCount = templatesRes.data?.data?.length || 0;

      // Fetch campaign stats
      const campaignStatsRes = await api.get('/campaigns/stats');
      const campaignStats = campaignStatsRes.data?.data || {};

      setStats({
        whatsappNumbers: numbersCount,
        templates: templatesCount,
        campaigns: campaignStats.total_campaigns || 0,
        activeCampaigns: (campaignStats.running || 0) + (campaignStats.scheduled || 0),
        totalSent: campaignStats.total_sent || 0,
        totalFailed: campaignStats.total_failed || 0
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to campaigns for real-time updates
    const campaignsChannel = supabase
      .channel('campaigns-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns'
        },
        () => {
          // Refresh stats when campaigns change
          fetchStats();
        }
      )
      .subscribe();

    // Cleanup on unmount
    return () => {
      campaignsChannel.unsubscribe();
    };
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                WhatsApp Cloud API Platform
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Welcome, {user?.email}
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Notifications Bell */}
              <NotificationBell />

              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Overview */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Overview
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {/* Active Campaigns */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Campaigns</p>
                  <p className="text-3xl font-bold text-green-600 mt-2">
                    {loading ? '...' : stats.activeCampaigns}
                  </p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Total Sent */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Messages Sent</p>
                  <p className="text-3xl font-bold text-blue-600 mt-2">
                    {loading ? '...' : stats.totalSent.toLocaleString()}
                  </p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Failed Messages */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Failed Messages</p>
                  <p className="text-3xl font-bold text-red-600 mt-2">
                    {loading ? '...' : stats.totalFailed.toLocaleString()}
                  </p>
                </div>
                <div className="bg-red-100 rounded-full p-3">
                  <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Navigation */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Quick Access
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => navigate('/whatsapp-numbers')}
              className="bg-white shadow rounded-lg p-6 text-left hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                WhatsApp Numbers
              </h3>
              <p className="text-gray-600 text-sm">
                Connect and manage WhatsApp numbers
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-2xl font-bold text-indigo-600">
                  {loading ? '...' : stats.whatsappNumbers}
                </p>
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>

            <button
              onClick={() => navigate('/templates')}
              className="bg-white shadow rounded-lg p-6 text-left hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Templates
              </h3>
              <p className="text-gray-600 text-sm">
                Message templates synced from WhatsApp
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-2xl font-bold text-indigo-600">
                  {loading ? '...' : stats.templates}
                </p>
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>

            <button
              onClick={() => navigate('/campaigns')}
              className="bg-white shadow rounded-lg p-6 text-left hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Campaigns
              </h3>
              <p className="text-gray-600 text-sm">
                Create and manage campaigns
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-2xl font-bold text-indigo-600">
                  {loading ? '...' : stats.campaigns}
                </p>
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>

            <button
              onClick={() => navigate('/inbox')}
              className="bg-white shadow rounded-lg p-6 text-left hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Inbox
              </h3>
              <p className="text-gray-600 text-sm">
                View all conversations and messages
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-2xl font-bold text-indigo-600">
                  View
                </p>
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>

            <button
              onClick={() => navigate('/settings')}
              className="bg-white shadow rounded-lg p-6 text-left hover:shadow-lg transition-shadow cursor-pointer"
            >
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Settings
              </h3>
              <p className="text-gray-600 text-sm">
                Configure global LLM and system settings
              </p>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-2xl font-bold text-indigo-600">
                  Configure
                </p>
                <svg
                  className="h-6 w-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
