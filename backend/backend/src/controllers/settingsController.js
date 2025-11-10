const { supabase } = require('../config/supabase');

/**
 * Get global LLM settings
 */
exports.getLLMSettings = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('global_llm_settings')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows returned (which is ok, means not configured yet)
      throw error;
    }

    // Return default values if no settings exist
    const settings = data || {
      model_name: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      api_key: process.env.OPENAI_API_KEY || '',
      temperature: 0.7,
      max_tokens: 512
    };

    // Mask API key (show only last 4 characters)
    if (settings.api_key) {
      const masked = settings.api_key.slice(-4).padStart(settings.api_key.length, '*');
      settings.api_key_masked = masked;
      delete settings.api_key; // Don't send full key to frontend
    }

    res.json({
      success: true,
      data: settings
    });

  } catch (error) {
    console.error('Get LLM settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get LLM settings'
    });
  }
};

/**
 * Update global LLM settings
 */
exports.updateLLMSettings = async (req, res) => {
  try {
    const { model_name, api_key, temperature, max_tokens } = req.body;

    // Validation
    if (!model_name) {
      return res.status(400).json({
        success: false,
        message: 'Model name is required'
      });
    }

    if (!api_key) {
      return res.status(400).json({
        success: false,
        message: 'API key is required'
      });
    }

    if (!api_key.startsWith('sk-')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OpenAI API key format (must start with sk-)'
      });
    }

    // Check if settings exist
    const { data: existing } = await supabase
      .from('global_llm_settings')
      .select('id')
      .single();

    const settingsData = {
      model_name,
      api_key,
      temperature: temperature || 0.7,
      max_tokens: max_tokens || 512,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existing) {
      // Update existing settings
      const { data, error } = await supabase
        .from('global_llm_settings')
        .update(settingsData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Insert new settings
      const { data, error } = await supabase
        .from('global_llm_settings')
        .insert(settingsData)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    // Don't return API key in response
    delete result.api_key;

    res.json({
      success: true,
      message: 'LLM settings updated successfully',
      data: result
    });

  } catch (error) {
    console.error('Update LLM settings error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update LLM settings'
    });
  }
};

/**
 * Test OpenAI API connection
 */
exports.testLLMConnection = async (req, res) => {
  try {
    const { api_key, model_name } = req.body;

    if (!api_key || !model_name) {
      return res.status(400).json({
        success: false,
        message: 'API key and model name are required'
      });
    }

    // Test the API key with a simple completion
    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: api_key });

    const completion = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'user', content: 'Say "test successful" if you can read this.' }],
      max_tokens: 20,
      temperature: 0.7
    });

    const response = completion.choices[0]?.message?.content;

    res.json({
      success: true,
      message: 'Connection successful',
      test_response: response
    });

  } catch (error) {
    console.error('Test LLM connection error:', error);

    let errorMessage = 'Failed to connect to OpenAI';

    if (error.status === 401) {
      errorMessage = 'Invalid API key';
    } else if (error.status === 404) {
      errorMessage = 'Model not found or not accessible with this API key';
    } else if (error.message) {
      errorMessage = error.message;
    }

    res.status(400).json({
      success: false,
      message: errorMessage
    });
  }
};
