import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { supabase } from '../config/supabase';

const Inbox = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [stats, setStats] = useState({});

  // Filters
  const [whatsappNumbers, setWhatsappNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchWhatsappNumbers();
    fetchConversations();
    fetchStats();
    setupRealtimeSubscriptions();
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [selectedNumber, searchQuery, startDate, endDate]);

  const fetchWhatsappNumbers = async () => {
    try {
      const res = await api.get('/whatsapp-numbers');
      setWhatsappNumbers(res.data?.data || []);
    } catch (error) {
      console.error('Error fetching WhatsApp numbers:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedNumber) params.append('whatsapp_number_id', selectedNumber);
      if (searchQuery) params.append('search', searchQuery);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await api.get(`/messages/conversations?${params.toString()}`);
      setConversations(res.data?.data || []);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/messages/stats');
      setStats(res.data?.data || {});
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchConversationMessages = async (conversation) => {
    try {
      setMessagesLoading(true);
      setSelectedConversation(conversation);

      const res = await api.get(
        `/messages/conversations/${conversation.whatsapp_number_id}/${conversation.user_phone}`
      );
      setMessages(res.data?.data?.messages || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const setupRealtimeSubscriptions = () => {
    // Subscribe to messages for real-time updates
    const messagesChannel = supabase
      .channel('messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        () => {
          fetchConversations();
          if (selectedConversation) {
            fetchConversationMessages(selectedConversation);
          }
        }
      )
      .subscribe();

    return () => {
      messagesChannel.unsubscribe();
    };
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const clearFilters = () => {
    setSelectedNumber('');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
              <p className="text-sm text-gray-600 mt-1">
                {stats.total_conversations || 0} conversations • {stats.total_messages || 0} messages
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* WhatsApp Number Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                WhatsApp Number
              </label>
              <select
                value={selectedNumber}
                onChange={(e) => setSelectedNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All Numbers</option>
                {whatsappNumbers.map((num) => (
                  <option key={num.id} value={num.id}>
                    {num.display_name || num.number}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Phone or message..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Clear Filters Button */}
          {(selectedNumber || searchQuery || startDate || endDate) && (
            <div className="mt-4">
              <button
                onClick={clearFilters}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Conversations and Messages Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversations List */}
          <div className="lg:col-span-1 bg-white shadow rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Conversations</h2>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
              {loading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No conversations found</div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={`${conv.whatsapp_number_id}_${conv.user_phone}`}
                    onClick={() => fetchConversationMessages(conv)}
                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                      selectedConversation?.user_phone === conv.user_phone &&
                      selectedConversation?.whatsapp_number_id === conv.whatsapp_number_id
                        ? 'bg-indigo-50'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {conv.user_phone}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {conv.whatsapp_number_display}
                        </p>
                        <p className="text-sm text-gray-600 truncate mt-1">
                          {conv.last_message?.message_body || 'No messages'}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0 text-right">
                        <p className="text-xs text-gray-500">
                          {conv.last_message?.created_at
                            ? formatTimestamp(conv.last_message.created_at)
                            : ''}
                        </p>
                        {conv.unread_count > 0 && (
                          <span className="inline-flex items-center justify-center mt-1 px-2 py-1 text-xs font-bold leading-none text-white bg-indigo-600 rounded-full">
                            {conv.unread_count}
                          </span>
                        )}
                        {conv.reply_limit_reached && (
                          <span className="inline-flex items-center mt-1 px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded">
                            40/40
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Message Thread Viewer */}
          <div className="lg:col-span-2 bg-white shadow rounded-lg overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Thread Header */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {selectedConversation.user_phone}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {selectedConversation.whatsapp_number_display}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">
                        {selectedConversation.total_messages} messages
                      </p>
                      {selectedConversation.reply_limit_reached ? (
                        <span className="inline-flex items-center mt-1 px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded-full">
                          Reply limit reached (40/40)
                        </span>
                      ) : (
                        <span className="text-sm text-gray-500">
                          Replies: {selectedConversation.reply_count}/40
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div
                  className="p-4 overflow-y-auto bg-gray-50"
                  style={{ maxHeight: '500px' }}
                >
                  {messagesLoading ? (
                    <div className="text-center text-gray-500">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-gray-500">No messages</div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-md px-4 py-2 rounded-lg ${
                              msg.direction === 'outgoing'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white text-gray-900 border border-gray-200'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{msg.message_body}</p>
                            <div
                              className={`text-xs mt-1 ${
                                msg.direction === 'outgoing'
                                  ? 'text-indigo-100'
                                  : 'text-gray-500'
                              }`}
                            >
                              {new Date(msg.created_at).toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                              {msg.status && msg.direction === 'outgoing' && (
                                <span className="ml-2">• {msg.status}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a conversation to view messages
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Inbox;
