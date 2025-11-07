const { verifyWebhookSignature, processWebhookEntry } = require('../services/webhookService');

/**
 * Webhook verification endpoint (GET)
 * Meta sends a GET request to verify the webhook URL
 */
exports.verifyWebhook = (req, res) => {
  try {
    // Parse query params
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('[Webhook] Verification request received');
    console.log('[Webhook] Mode:', mode);
    console.log('[Webhook] Token:', token);

    // Check if mode and token are correct
    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      console.log('[Webhook] ✅ Verification successful');

      // Respond with challenge
      res.status(200).send(challenge);
    } else {
      console.log('[Webhook] ❌ Verification failed - invalid token');
      res.sendStatus(403);
    }

  } catch (error) {
    console.error('[Webhook] Verification error:', error);
    res.sendStatus(500);
  }
};

/**
 * Webhook event handler (POST)
 * Receives messages and status updates from Meta
 */
exports.handleWebhook = async (req, res) => {
  try {
    // IMPORTANT: Always return 200 to Meta to prevent retries
    // Process in background and log errors
    res.sendStatus(200);

    const signature = req.headers['x-hub-signature-256'];

    // req.body is a Buffer from express.raw() middleware
    const rawBody = req.body.toString('utf8');

    console.log('[Webhook] Event received');

    // Verify signature
    const isValid = verifyWebhookSignature(signature, rawBody);
    if (!isValid) {
      console.error('[Webhook] ❌ Invalid signature - webhook rejected');
      return;
    }

    console.log('[Webhook] ✅ Signature verified');

    // Parse webhook data
    const data = JSON.parse(rawBody);

    // Meta sends test webhooks - ignore them
    if (data.object !== 'whatsapp_business_account') {
      console.log('[Webhook] Ignoring non-WhatsApp webhook');
      return;
    }

    // Process each entry
    const entries = data.entry || [];
    console.log(`[Webhook] Processing ${entries.length} entry/entries`);

    for (const entry of entries) {
      await processWebhookEntry(entry);
    }

    console.log('[Webhook] ✅ Webhook processed successfully');

  } catch (error) {
    console.error('[Webhook] ❌ Error processing webhook:', error);
    // Don't throw - we already sent 200 to Meta
  }
};
