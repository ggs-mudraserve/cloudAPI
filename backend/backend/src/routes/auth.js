const express = require('express');
const router = express.Router();
const { login, logout, verifySession } = require('../controllers/authController');
const { validateJWT } = require('../middleware/auth');

/**
 * @route   POST /api/auth/login
 * @desc    Login with email and password
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and invalidate session
 * @access  Private (requires valid JWT)
 */
router.post('/logout', validateJWT, logout);

/**
 * @route   GET /api/auth/verify
 * @desc    Verify current session and return user info
 * @access  Private (requires valid JWT)
 */
router.get('/verify', validateJWT, verifySession);

module.exports = router;
