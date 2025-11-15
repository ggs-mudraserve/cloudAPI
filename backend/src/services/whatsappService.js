const axios = require('axios');

const WHATSAPP_API_BASE = 'https://graph.facebook.com/v18.0';

// HTTP Keep-Alive agent will be injected from queueProcessor
let whatsappClient = axios.create({
  baseURL: WHATSAPP_API_BASE,
  timeout: 30000
});

// Function to set the keep-alive agent (called from queueProcessor)
function setHttpAgent(agent) {
  whatsappClient = axios.create({
    baseURL: WHATSAPP_API_BASE,
    httpsAgent: agent,
    timeout: 30000
  });
}

/**
 * Test connection to WhatsApp Cloud API
 * Validates access token by fetching phone number details
 */
async function testConnection(phoneNumberId, accessToken) {
  try {
    // Clean token: remove line breaks and extra spaces
    const cleanToken = accessToken.replace(/\s+/g, '').trim();
    const cleanPhoneId = phoneNumberId.replace(/\s+/g, '').trim();

    const response = await axios.get(
      `${WHATSAPP_API_BASE}/${cleanPhoneId}`,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`
        },
        params: {
          fields: 'verified_name,display_phone_number,quality_rating,messaging_limit_tier'
        }
      }
    );

    return {
      success: true,
      data: {
        verified_name: response.data.verified_name,
        display_phone_number: response.data.display_phone_number,
        quality_rating: response.data.quality_rating,
        tier: response.data.messaging_limit_tier
      }
    };
  } catch (error) {
    console.error('WhatsApp API test connection error:', error.response?.data || error.message);

    // Check for token expiration (error code 190)
    if (error.response?.data?.error?.code === 190) {
      return {
        success: false,
        error: 'Token expired, invalid, or corrupted. Please check your access token and ensure there are no extra spaces or line breaks.',
        code: 190
      };
    }

    return {
      success: false,
      error: error.response?.data?.error?.message || 'Connection test failed',
      code: error.response?.data?.error?.code
    };
  }
}

/**
 * Send a template message via WhatsApp Cloud API
 *
 * @param {string} phoneNumberId - WhatsApp Phone Number ID
 * @param {string} accessToken - Access token
 * @param {string} to - Recipient phone number (e.g., 919876543210)
 * @param {string} templateName - Template name
 * @param {string} language - Template language code (e.g., 'en')
 * @param {object} variables - Template variables object (e.g., { var1: 'value1', var2: 'value2' })
 * @param {array} templateComponents - Template components from database (to determine media header)
 */
async function sendTemplateMessage(phoneNumberId, accessToken, to, templateName, language, variables = {}, templateComponents = []) {
  try {
    // Clean inputs
    const cleanToken = accessToken.replace(/\s+/g, '').trim();
    const cleanPhoneId = phoneNumberId.replace(/\s+/g, '').trim();
    const cleanTo = to.replace(/\s+/g, '').trim();

    // Build template components with variables
    const components = [];

    // Get variable values in order (var1, var2, var3, ...)
    const variableValues = Object.values(variables);
    let currentVarIndex = 0;

    // Check if template has media header (VIDEO, IMAGE, or DOCUMENT)
    const headerComponent = templateComponents.find(c => c.type === 'HEADER');
    const hasMediaHeader = headerComponent &&
      (headerComponent.format === 'VIDEO' || headerComponent.format === 'IMAGE' || headerComponent.format === 'DOCUMENT');

    if (hasMediaHeader && variableValues.length > 0) {
      const mediaUrl = variableValues[currentVarIndex];
      currentVarIndex++;

      let mediaType = 'video'; // Default
      if (headerComponent.format === 'IMAGE') mediaType = 'image';
      else if (headerComponent.format === 'DOCUMENT') mediaType = 'document';

      components.push({
        type: 'header',
        parameters: [{
          type: mediaType,
          [mediaType]: {
            link: String(mediaUrl)
          }
        }]
      });
    }

    // Remaining variables go to body as text parameters
    const bodyVariables = variableValues.slice(currentVarIndex);
    if (bodyVariables.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyVariables.map(value => ({
          type: 'text',
          text: String(value)
        }))
      });
    }

    // Build payload
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language
        },
        components: components.length > 0 ? components : undefined
      }
    };

    // DEBUG: Log the payload being sent
    console.log('[WhatsApp] Sending payload:', JSON.stringify(payload, null, 2));

    const response = await whatsappClient.post(
      `/${cleanPhoneId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messages[0].id
    };
  } catch (error) {
    console.error('WhatsApp send message error:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to send message',
      errorCode: error.response?.data?.error?.code,
      errorSubcode: error.response?.data?.error?.error_subcode
    };
  }
}

/**
 * Send a text message via WhatsApp Cloud API
 */
async function sendTextMessage(phoneNumberId, accessToken, to, text) {
  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: {
        body: text
      }
    };

    const response = await whatsappClient.post(
      `/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      messageId: response.data.messages[0].id
    };
  } catch (error) {
    console.error('WhatsApp send text error:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to send text message',
      errorCode: error.response?.data?.error?.code
    };
  }
}

/**
 * Fetch templates for a WhatsApp Business Account
 */
async function fetchTemplates(wabaId, accessToken) {
  try {
    // Clean token and WABA ID
    const cleanToken = accessToken.replace(/\s+/g, '').trim();
    const cleanWabaId = wabaId.replace(/\s+/g, '').trim();

    let allTemplates = [];
    let after = null;
    let hasMore = true;

    // Handle pagination (WhatsApp returns max 100 templates per page)
    while (hasMore) {
      const params = {
        fields: 'name,category,language,status,components',
        limit: 100
      };

      if (after) {
        params.after = after;
      }

      const response = await axios.get(
        `${WHATSAPP_API_BASE}/${cleanWabaId}/message_templates`,
        {
          headers: {
            'Authorization': `Bearer ${cleanToken}`
          },
          params
        }
      );

      allTemplates = allTemplates.concat(response.data.data || []);

      // Check if there are more pages
      if (response.data.paging && response.data.paging.cursors && response.data.paging.cursors.after) {
        after = response.data.paging.cursors.after;
      } else {
        hasMore = false;
      }
    }

    return {
      success: true,
      templates: allTemplates,
      count: allTemplates.length
    };
  } catch (error) {
    console.error('WhatsApp fetch templates error:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to fetch templates',
      errorCode: error.response?.data?.error?.code
    };
  }
}

/**
 * Mark message as read
 */
async function markMessageAsRead(phoneNumberId, accessToken, messageId) {
  try {
    await axios.post(
      `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return { success: true };
  } catch (error) {
    console.error('WhatsApp mark read error:', error.response?.data || error.message);
    return { success: false };
  }
}

/**
 * Get WhatsApp Business Profile info (display name and profile picture)
 */
async function getBusinessProfile(phoneNumberId, accessToken, wabaId) {
  try {
    const cleanToken = accessToken.replace(/\s+/g, '').trim();
    const cleanPhoneId = phoneNumberId.replace(/\s+/g, '').trim();

    // Get the phone number details for verified_name and name status
    const phoneResponse = await axios.get(
      `${WHATSAPP_API_BASE}/${cleanPhoneId}`,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`
        },
        params: {
          fields: 'verified_name,display_phone_number,name_status'
        }
      }
    );

    // Get business profile info (profile picture is here, not on phone number object)
    const profileResponse = await axios.get(
      `${WHATSAPP_API_BASE}/${cleanPhoneId}/whatsapp_business_profile`,
      {
        headers: {
          'Authorization': `Bearer ${cleanToken}`
        },
        params: {
          fields: 'profile_picture_url,about,description,email'
        }
      }
    );

    return {
      success: true,
      data: {
        verified_name: phoneResponse.data.verified_name,
        display_phone_number: phoneResponse.data.display_phone_number,
        name_status: phoneResponse.data.name_status || 'UNKNOWN',
        profile_picture_url: profileResponse.data.data?.[0]?.profile_picture_url || null,
        about: profileResponse.data.data?.[0]?.about || null
      }
    };
  } catch (error) {
    console.error('WhatsApp get business profile error:', error.response?.data || error.message);

    return {
      success: false,
      error: error.response?.data?.error?.message || 'Failed to fetch business profile',
      errorCode: error.response?.data?.error?.code
    };
  }
}

module.exports = {
  testConnection,
  sendTemplateMessage,
  sendTextMessage,
  fetchTemplates,
  markMessageAsRead,
  getBusinessProfile,
  setHttpAgent
};
