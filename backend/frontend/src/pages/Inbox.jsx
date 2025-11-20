import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messageOffset, setMessageOffset] = useState(0);
  const MESSAGE_LIMIT = 50; // Load 50 messages at a time

  // Filters
  const [whatsappNumbers, setWhatsappNumbers] = useState([]);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Send message state
  const [showSendModal, setShowSendModal] = useState(false);
  const [sendType, setSendType] = useState('text'); // 'text' or 'template'
  const [messageText, setMessageText] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // New message to unknown contact state
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState('');
  const [selectedWhatsappNumberForNew, setSelectedWhatsappNumberForNew] = useState('');

  // Template variables state
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateVariables, setTemplateVariables] = useState({});

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

  const fetchConversationMessages = async (conversation, offset = 0, append = false) => {
    try {
      if (!append) {
        setMessagesLoading(true);
        setSelectedConversation(conversation);
        setMessageOffset(0);
      } else {
        setLoadingMore(true);
      }

      const res = await api.get(
        `/messages/conversations/${conversation.whatsapp_number_id}/${conversation.user_phone}?limit=${MESSAGE_LIMIT}&offset=${offset}`
      );

      const newMessages = res.data?.data?.messages || [];

      if (append) {
        // Prepend older messages to the top
        setMessages(prev => [...newMessages, ...prev]);
      } else {
        // Replace messages (initial load)
        setMessages(newMessages);
      }

      // Check if there are more messages to load
      setHasMoreMessages(newMessages.length === MESSAGE_LIMIT);

    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setMessagesLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMoreMessages = () => {
    if (!selectedConversation || loadingMore || !hasMoreMessages) return;

    const newOffset = messageOffset + MESSAGE_LIMIT;
    setMessageOffset(newOffset);
    fetchConversationMessages(selectedConversation, newOffset, true);
  };

  // Debounce ref to prevent rapid updates during campaigns
  const debounceTimeoutRef = useRef(null);
  const lastUpdateRef = useRef(0);

  const setupRealtimeSubscriptions = () => {
    // Subscribe to messages for real-time updates with debouncing
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
          // Debounce: only update every 20 seconds max to prevent excessive refreshing during campaigns
          const now = Date.now();
          if (now - lastUpdateRef.current < 20000) {
            // Schedule update for later if not already scheduled
            if (!debounceTimeoutRef.current) {
              debounceTimeoutRef.current = setTimeout(() => {
                debounceTimeoutRef.current = null;
                lastUpdateRef.current = Date.now();
                fetchConversations();
                if (selectedConversation) {
                  fetchConversationMessages(selectedConversation);
                }
              }, 20000);
            }
            return;
          }

          lastUpdateRef.current = now;
          fetchConversations();
          if (selectedConversation) {
            fetchConversationMessages(selectedConversation);
          }
        }
      )
      .subscribe();

    return () => {
      messagesChannel.unsubscribe();
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
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

  // Helper function to count template variables
  const getTemplateVariableCount = (template) => {
    if (!template || !template.components) return 0;

    let count = 0;

    // Check header for media (VIDEO, IMAGE, DOCUMENT)
    const header = template.components.find(c => c.type === 'HEADER');
    if (header && (header.format === 'VIDEO' || header.format === 'IMAGE' || header.format === 'DOCUMENT')) {
      count++; // Media URL
    }

    // Check body for variables
    const body = template.components.find(c => c.type === 'BODY');
    if (body && body.text) {
      const matches = body.text.match(/\{\{(\d+)\}\}/g);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  };

  const openSendModal = async () => {
    if (!selectedConversation) return;

    setSendError('');
    setShowSendModal(true);

    // Fetch templates for the selected WhatsApp number
    try {
      const res = await api.get(`/templates?whatsapp_number_id=${selectedConversation.whatsapp_number_id}`);
      const activeTemplates = (res.data?.data || []).filter(t => t.is_active && t.category !== 'MARKETING');
      setTemplates(activeTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setSendError('Failed to load templates');
    }
  };

  const closeSendModal = () => {
    setShowSendModal(false);
    setMessageText('');
    setSelectedTemplateId('');
    setSendType('text');
    setSendError('');
  };

  const handleSendMessage = async () => {
    if (!selectedConversation) return;

    setSending(true);
    setSendError('');

    try {
      if (sendType === 'text') {
        if (!messageText.trim()) {
          setSendError('Please enter a message');
          setSending(false);
          return;
        }

        await api.post('/messages/send-text', {
          whatsapp_number_id: selectedConversation.whatsapp_number_id,
          user_phone: selectedConversation.user_phone,
          text: messageText
        });
      } else {
        if (!selectedTemplateId) {
          setSendError('Please select a template');
          setSending(false);
          return;
        }

        // Validate template variables are filled
        const varCount = getTemplateVariableCount(selectedTemplate);
        if (varCount > 0) {
          const allFilled = Object.keys(templateVariables).length === varCount &&
                           Object.values(templateVariables).every(v => v && v.trim() !== '');
          if (!allFilled) {
            setSendError('Please fill in all template variables');
            setSending(false);
            return;
          }
        }

        await api.post('/messages/send-template', {
          whatsapp_number_id: selectedConversation.whatsapp_number_id,
          user_phone: selectedConversation.user_phone,
          template_id: selectedTemplateId,
          variables: templateVariables
        });
      }

      // Refresh messages
      await fetchConversationMessages(selectedConversation);
      closeSendModal();
    } catch (error) {
      console.error('Error sending message:', error);
      setSendError(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const openNewMessageModal = () => {
    setShowNewMessageModal(true);
    setSendError('');
    setNewContactPhone('');
    setSelectedWhatsappNumberForNew(whatsappNumbers[0]?.id || '');
    setSendType('text');
    setMessageText('');
    setSelectedTemplateId('');
  };

  const closeNewMessageModal = () => {
    setShowNewMessageModal(false);
    setNewContactPhone('');
    setSelectedWhatsappNumberForNew('');
    setSendType('text');
    setMessageText('');
    setSelectedTemplateId('');
    setSendError('');
  };

  const handleNewMessageWhatsappNumberChange = async (whatsappNumberId) => {
    setSelectedWhatsappNumberForNew(whatsappNumberId);

    // Fetch templates for selected number
    if (sendType === 'template' && whatsappNumberId) {
      try {
        const res = await api.get(`/templates?whatsapp_number_id=${whatsappNumberId}`);
        const activeTemplates = (res.data?.data || []).filter(t => t.is_active && t.category !== 'MARKETING');
        setTemplates(activeTemplates);
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    }
  };

  const handleSendNewMessage = async () => {
    setSending(true);
    setSendError('');

    try {
      // Validate phone number
      if (!newContactPhone.trim()) {
        setSendError('Please enter a phone number');
        setSending(false);
        return;
      }

      // Clean phone number (remove spaces, dashes, etc.)
      const cleanPhone = newContactPhone.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        setSendError('Please enter a valid phone number');
        setSending(false);
        return;
      }

      if (!selectedWhatsappNumberForNew) {
        setSendError('Please select a WhatsApp number');
        setSending(false);
        return;
      }

      if (sendType === 'text') {
        if (!messageText.trim()) {
          setSendError('Please enter a message');
          setSending(false);
          return;
        }

        await api.post('/messages/send-text', {
          whatsapp_number_id: selectedWhatsappNumberForNew,
          user_phone: cleanPhone,
          text: messageText
        });
      } else {
        if (!selectedTemplateId) {
          setSendError('Please select a template');
          setSending(false);
          return;
        }

        // Validate all variables are filled
        const varCount = getTemplateVariableCount(selectedTemplate);
        if (varCount > 0) {
          for (let i = 1; i <= varCount; i++) {
            if (!templateVariables[`var${i}`] || templateVariables[`var${i}`].trim() === '') {
              setSendError(`Please fill in all template variables`);
              setSending(false);
              return;
            }
          }
        }

        await api.post('/messages/send-template', {
          whatsapp_number_id: selectedWhatsappNumberForNew,
          user_phone: cleanPhone,
          template_id: selectedTemplateId,
          variables: templateVariables
        });
      }

      // Refresh conversations list
      await fetchConversations();
      closeNewMessageModal();
    } catch (error) {
      console.error('Error sending message:', error);
      setSendError(error.response?.data?.error || 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleNewMessageTypeChange = async (type) => {
    setSendType(type);

    // Fetch templates if switching to template type
    if (type === 'template' && selectedWhatsappNumberForNew) {
      try {
        const res = await api.get(`/templates?whatsapp_number_id=${selectedWhatsappNumberForNew}`);
        const activeTemplates = (res.data?.data || []).filter(t => t.is_active && t.category !== 'MARKETING');
        setTemplates(activeTemplates);
      } catch (error) {
        console.error('Error fetching templates:', error);
      }
    }
  };

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId);

    const template = templates.find(t => t.id === templateId);
    setSelectedTemplate(template);

    // Initialize variables object
    if (template) {
      const varCount = getTemplateVariableCount(template);
      const vars = {};
      for (let i = 1; i <= varCount; i++) {
        vars[`var${i}`] = '';
      }
      setTemplateVariables(vars);
    } else {
      setTemplateVariables({});
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Title */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-600 mt-1">
            {stats.total_conversations || 0} conversations • {stats.total_messages || 0} messages
          </p>
        </div>
        <button
          onClick={openNewMessageModal}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Message
        </button>
      </div>
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
                    <div className="flex items-center gap-4">
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
                      <button
                        onClick={openSendModal}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                      >
                        Send Message
                      </button>
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
                      {/* Load More Button at Top */}
                      {hasMoreMessages && (
                        <div className="text-center pb-4">
                          <button
                            onClick={loadMoreMessages}
                            disabled={loadingMore}
                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {loadingMore ? (
                              <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Loading...
                              </span>
                            ) : (
                              'Load More Messages'
                            )}
                          </button>
                        </div>
                      )}

                      {/* Messages */}
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
                            {/* Show button indicator for button/interactive messages */}
                            {(msg.message_type === 'button' || msg.message_type === 'interactive') && msg.direction === 'incoming' && (
                              <div className="flex items-center gap-1 mb-1 text-xs text-gray-500">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                                </svg>
                                <span>Button clicked</span>
                              </div>
                            )}

                            {/* Media Preview */}
                            {msg.message_type === 'image' && msg.media_url && (
                              <div className="mb-2">
                                <img
                                  src={`/api/media/${msg.id}`}
                                  alt="Image message"
                                  className="max-w-xs rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(`/api/media/${msg.id}`, '_blank')}
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'block';
                                  }}
                                />
                                <p className="text-sm text-gray-500 italic hidden">Failed to load image</p>
                              </div>
                            )}

                            {msg.message_type === 'video' && msg.media_url && (
                              <div className="mb-2">
                                <video
                                  src={`/api/media/${msg.id}`}
                                  controls
                                  className="max-w-xs rounded-lg"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'block';
                                  }}
                                />
                                <p className="text-sm text-gray-500 italic hidden">Failed to load video</p>
                              </div>
                            )}

                            {msg.message_type === 'document' && msg.media_url && (
                              <div className="mb-2 p-3 bg-gray-100 rounded-lg">
                                <a
                                  href={`/api/media/${msg.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-blue-600 hover:text-blue-800"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-sm font-medium">View Document</span>
                                </a>
                              </div>
                            )}

                            {msg.message_type === 'audio' && msg.media_url && (
                              <div className="mb-2">
                                <audio
                                  src={`/api/media/${msg.id}`}
                                  controls
                                  className="max-w-xs"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'block';
                                  }}
                                />
                                <p className="text-sm text-gray-500 italic hidden">Failed to load audio</p>
                              </div>
                            )}

                            {/* Message Text/Caption */}
                            {(msg.message_body || !msg.media_url) && (
                              <p className="text-sm whitespace-pre-wrap">
                                {msg.message_body || (msg.message_type === 'button' || msg.message_type === 'interactive' ? '[Button interaction]' : '[No content]')}
                              </p>
                            )}
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

        {/* Send Message Modal */}
        {showSendModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  Send Message to {selectedConversation?.user_phone}
                </h3>
                <button
                  onClick={closeSendModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4">
                {sendError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                    {sendError}
                  </div>
                )}

                {/* Type Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSendType('text')}
                      className={`flex-1 px-4 py-2 rounded-lg border font-medium transition-colors ${
                        sendType === 'text'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Text Message
                    </button>
                    <button
                      onClick={() => setSendType('template')}
                      className={`flex-1 px-4 py-2 rounded-lg border font-medium transition-colors ${
                        sendType === 'template'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Template
                    </button>
                  </div>
                </div>

                {/* Text Message Input */}
                {sendType === 'text' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Message
                    </label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Type your message..."
                    />
                  </div>
                )}

                {/* Template Selection */}
                {sendType === 'template' && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Template
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleTemplateSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Choose a template...</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.language})
                          </option>
                        ))}
                      </select>
                      {templates.length === 0 && (
                      <p className="text-sm text-gray-500 mt-2">
                        No active templates available for this WhatsApp number
                      </p>
                    )}
                    </div>

                    {/* Template Variables */}
                    {selectedTemplate && getTemplateVariableCount(selectedTemplate) > 0 && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Template Variables
                        </label>
                        {(() => {
                          const header = selectedTemplate.components?.find(c => c.type === 'HEADER');
                          const hasMediaHeader = header && (header.format === 'VIDEO' || header.format === 'IMAGE' || header.format === 'DOCUMENT');

                          return (
                            <div className="space-y-3">
                              {/* Media Header URL */}
                              {hasMediaHeader && (
                                <div key="media">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    {header.format} URL
                                  </label>
                                  <input
                                    type="url"
                                    value={templateVariables['var1'] || ''}
                                    onChange={(e) => setTemplateVariables({...templateVariables, 'var1': e.target.value})}
                                    placeholder={`Enter ${header.format.toLowerCase()} URL`}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              )}

                              {/* Body Variables */}
                              {selectedTemplate.components?.find(c => c.type === 'BODY')?.text?.match(/\{\{(\d+)\}\}/g)?.map((match, idx) => {
                                const currentIdx = hasMediaHeader ? idx + 2 : idx + 1;
                                return (
                                  <div key={`var${currentIdx}`}>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Variable {currentIdx}
                                    </label>
                                    <input
                                      type="text"
                                      value={templateVariables[`var${currentIdx}`] || ''}
                                      onChange={(e) => setTemplateVariables({...templateVariables, [`var${currentIdx}`]: e.target.value})}
                                      placeholder={`Enter value for variable ${currentIdx}`}
                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={closeSendModal}
                  disabled={sending}
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Message'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New Message Modal (for unknown contacts) */}
        {showNewMessageModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  New Message
                </h3>
                <button
                  onClick={closeNewMessageModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4">
                {sendError && (
                  <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-lg text-sm">
                    {sendError}
                  </div>
                )}

                {/* Phone Number Input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="919876543210"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter phone number with country code (e.g., 919876543210)
                  </p>
                </div>

                {/* WhatsApp Number Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Send From
                  </label>
                  <select
                    value={selectedWhatsappNumberForNew}
                    onChange={(e) => handleNewMessageWhatsappNumberChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {whatsappNumbers.map((num) => (
                      <option key={num.id} value={num.id}>
                        {num.display_name || num.number}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleNewMessageTypeChange('text')}
                      className={`flex-1 px-4 py-2 rounded-lg border font-medium transition-colors ${
                        sendType === 'text'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Text Message
                    </button>
                    <button
                      onClick={() => handleNewMessageTypeChange('template')}
                      className={`flex-1 px-4 py-2 rounded-lg border font-medium transition-colors ${
                        sendType === 'template'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Template
                    </button>
                  </div>
                </div>

                {/* Text Message Input */}
                {sendType === 'text' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Message
                    </label>
                    <textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Type your message..."
                    />
                  </div>
                )}

                {/* Template Selection */}
                {sendType === 'template' && (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Template
                      </label>
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleTemplateSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">Choose a template...</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.language})
                          </option>
                        ))}
                      </select>
                      {templates.length === 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          No active templates available for this WhatsApp number
                        </p>
                      )}
                    </div>

                    {/* Template Variables */}
                    {selectedTemplate && getTemplateVariableCount(selectedTemplate) > 0 && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                          Template Variables
                        </label>
                        {(() => {
                          const header = selectedTemplate.components?.find(c => c.type === 'HEADER');
                          const hasMediaHeader = header && (header.format === 'VIDEO' || header.format === 'IMAGE' || header.format === 'DOCUMENT');
                          let varIndex = 1;

                          return (
                            <div className="space-y-3">
                              {/* Media Header URL */}
                              {hasMediaHeader && (
                                <div key="media">
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    {header.format} URL
                                  </label>
                                  <input
                                    type="url"
                                    value={templateVariables['var1'] || ''}
                                    onChange={(e) => setTemplateVariables({...templateVariables, 'var1': e.target.value})}
                                    placeholder={`Enter ${header.format.toLowerCase()} URL`}
                                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              )}

                              {/* Body Variables */}
                              {selectedTemplate.components?.find(c => c.type === 'BODY')?.text?.match(/\{\{(\d+)\}\}/g)?.map((match, idx) => {
                                const currentIdx = hasMediaHeader ? idx + 2 : idx + 1;
                                return (
                                  <div key={`var${currentIdx}`}>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                      Variable {currentIdx}
                                    </label>
                                    <input
                                      type="text"
                                      value={templateVariables[`var${currentIdx}`] || ''}
                                      onChange={(e) => setTemplateVariables({...templateVariables, [`var${currentIdx}`]: e.target.value})}
                                      placeholder={`Enter value for variable ${currentIdx}`}
                                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                <button
                  onClick={closeNewMessageModal}
                  disabled={sending}
                  className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendNewMessage}
                  disabled={sending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </>
                  ) : (
                    'Send Message'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default Inbox;
