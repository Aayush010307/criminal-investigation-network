/** Wraps an async route handler so rejected promises reach the Express error handler. */
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
module.exports = { wrap };
