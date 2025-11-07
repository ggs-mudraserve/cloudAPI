const { supabase } = require('../config/supabase');

/**
 * Login with email and password using Supabase Auth
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required'
      });
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Login error:', error.message);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password'
      });
    }

    if (!data.user || !data.session) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed'
      });
    }

    // Return session data
    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in
      }
    });

  } catch (error) {
    console.error('Login exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed'
    });
  }
}

/**
 * Logout - invalidate session
 */
async function logout(req, res) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No authorization token provided'
      });
    }

    const token = authHeader.substring(7);

    // Sign out the user
    const { error } = await supabase.auth.admin.signOut(token);

    if (error) {
      console.error('Logout error:', error.message);
      // Even if sign out fails, we still return success to client
      // Client will clear local session
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed'
    });
  }
}

/**
 * Verify current session
 */
async function verifySession(req, res) {
  try {
    // User is already verified by validateJWT middleware
    // Just return user info
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    });
  } catch (error) {
    console.error('Verify session exception:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Session verification failed'
    });
  }
}

module.exports = {
  login,
  logout,
  verifySession
};
