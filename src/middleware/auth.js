function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    return next();
  };
}

function attachUser(store) {
  return async (req, res, next) => {
    if (!req.session.userId) return next();

    const user = await store.findUserById(req.session.userId);
    if (!user || user.suspended) {
      req.session.destroy(() => {});
      return next();
    }

    const safeUser = { ...user };
    delete safeUser.passwordHash;
    req.user = safeUser;
    return next();
  };
}

module.exports = { requireAuth, requireRole, attachUser };
