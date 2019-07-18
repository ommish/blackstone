const passport = require('passport');
const boom = require('@hapi/boom');

/**
 * Middleware that authenticates the request with jwt
 * Import and add this middleware to any route that needs jwt authentication
 */
const ensureAuth = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return next(boom.badImplementation(`Failed to authenticate: ${err}`));
    }
    if (!user) {
      if (info.message === 'No auth token') {
        return next(boom.unauthorized('No auth token found. Sign in to receive token'));
      }
      if (info && info.name === 'TokenExpiredError') {
        return next(boom.unauthorized(`Unauthorized: ${info.message}`));
      }
      if (info && info.name === 'JsonWebTokenError') {
        return next(boom.unauthorized(`JsonWebToken Error: ${info.message}`));
      }
      return next(boom.badImplementation(`Token Verification Failed: ${info.message}`));
    }
    if (!req.user) {
      return req.login(user, (loginErr) => {
        if (loginErr) return next(boom.badImplementation(`Failed to login user: ${loginErr.stack}`));
        return next();
      });
    }
    return next();
  })(req, res, next);
};

module.exports = {
  ensureAuth,
};
