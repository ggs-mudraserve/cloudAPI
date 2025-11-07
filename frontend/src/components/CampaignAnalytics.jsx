import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { supabase } from '../config/supabase';

const CampaignAnalytics = ({ filters = {} }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    setupRealtimeSubscriptions();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchStats();
  }, [filters.whatsapp_number_id, filters.status, filters.start_date, filters.end_date]);

  const fetchStats = async () => {
    try {
      setLoading(true);

      // Build query params from filters
      const params = new URLSearchParams();
      if (filters.whatsapp_number_id) params.append('whatsapp_number_id', filters.whatsapp_number_id);
      if (filters.status) params.append('status', filters.status);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);

      const res = await api.get(`/campaigns/stats?${params.toString()}`);
      setStats(res.data?.data);
    } catch (error) {
      console.error('Error fetching campaign stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to campaigns and messages for real-time updates
    const campaignsChannel = supabase
      .channel('campaigns-analytics')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaigns'
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel('messages-analytics')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_status_logs'
        },
        () => {
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      campaignsChannel.unsubscribe();
      messagesChannel.unsubscribe();
    };
  };

  if (loading || !stats) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  const messageStats = stats.message_stats || {};
  const hasData = stats.total_sent > 0;
  const hasWebhookData = (messageStats.sent?.count || 0) > 0 ||
                          (messageStats.delivered?.count || 0) > 0 ||
                          (messageStats.read?.count || 0) > 0;

  const statCards = [
    {
      label: 'Sent',
      percentage: messageStats.sent?.percentage || 0,
      count: messageStats.sent?.count || 0,
      color: 'blue'
    },
    {
      label: 'Delivered',
      percentage: messageStats.delivered?.percentage || 0,
      count: messageStats.delivered?.count || 0,
      color: 'orange'
    },
    {
      label: 'Read',
      percentage: messageStats.read?.percentage || 0,
      count: messageStats.read?.count || 0,
      color: 'green'
    },
    {
      label: 'Replied',
      percentage: messageStats.replied?.percentage || 0,
      count: messageStats.replied?.count || 0,
      color: 'purple'
    },
    {
      label: 'Failed',
      percentage: messageStats.failed?.percentage || 0,
      count: messageStats.failed?.count || 0,
      color: 'red'
    }
  ];

  const getColorClasses = (color) => {
    const colorMap = {
      blue: {
        text: 'text-blue-600',
        bg: 'bg-blue-100'
      },
      orange: {
        text: 'text-orange-600',
        bg: 'bg-orange-100'
      },
      green: {
        text: 'text-green-600',
        bg: 'bg-green-100'
      },
      purple: {
        text: 'text-purple-600',
        bg: 'bg-purple-100'
      },
      red: {
        text: 'text-red-600',
        bg: 'bg-red-100'
      }
    };
    return colorMap[color] || colorMap.blue;
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Campaign Analytics</h2>

      {/* Webhook Warning */}
      {hasData && !hasWebhookData && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="h-5 w-5 text-yellow-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">Webhook Not Connected</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Message delivery statistics (Sent, Delivered, Read) require WhatsApp webhook integration.
                Configure your webhook endpoint in Meta Business Manager to see real-time delivery data.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => {
          const colors = getColorClasses(stat.color);
          return (
            <div
              key={stat.label}
              className="bg-gray-50 rounded-lg p-6 border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="text-center">
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  {stat.label}
                </h3>
                <div className={`text-5xl font-bold ${colors.text} mb-3`}>
                  {stat.percentage}%
                </div>
                <div className={`inline-flex items-center justify-center px-4 py-2 rounded-full ${colors.bg}`}>
                  <span className={`text-lg font-semibold ${colors.text}`}>
                    {stat.count.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Info */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-sm text-gray-600">Total Campaigns</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total_campaigns}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Active</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.running + stats.scheduled}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Completed</p>
            <p className="text-2xl font-bold text-gray-600">{stats.completed}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Messages</p>
            <p className="text-2xl font-bold text-indigo-600">
              {stats.total_sent.toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignAnalytics;
