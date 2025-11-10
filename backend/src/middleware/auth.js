const { supabase } = require('../config/supabase');
const jwt = require('jsonwebtoken');

// In-memory cache for validated tokens (with TTL)
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear expired tokens from cache
 */
function clearExpiredCache() {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (now > data.expiresAt) {
      tokenCache.delete(token);
    }
  }
}

// Clear cache every minute
setInterval(clearExpiredCache, 60 * 1000);

/**
 * Middleware to validate JWT token from Supabase Auth
 * Uses local JWT verification with short-term caching to reduce API calls
 */
async function validateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Check cache first
    const cached = tokenCache.get(token);
    if (cached && Date.now() < cached.expiresAt) {
      req.user = cached.user;
      return next();
    }

    // Decode JWT locally (faster than API call)
    try {
      const decoded = jwt.decode(token);

      if (!decoded || !decoded.exp) {
        throw new Error('Invalid token structure');
      }

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Token expired'
        });
      }

      // For fresh tokens or cache miss, verify with Supabase (but cache the result)
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        tokenCache.delete(token); // Remove from cache if invalid
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      // Cache the validated user for 5 minutes
      tokenCache.set(token, {
        user,
        expiresAt: Date.now() + CACHE_TTL
      });

      // Attach user info to request object
      req.user = user;
      next();

    } catch (decodeError) {
      // If JWT decode fails, fall back to Supabase API
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        });
      }

      req.user = user;
      next();
    }

  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Optional middleware for routes that can work with or without authentication
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without auth on error
    next();
  }
}

module.exports = { validateJWT, optionalAuth };
