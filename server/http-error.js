// Thrown by the pure route-logic modules (server/notes.js, links.js, tabs.js,
// reminders.js, …) to signal an HTTP error without depending on Express. The
// thin wrapper in each server/routes/*.js file catches it and turns it into
// res.status(status).json({ error: message }) — see docs/plan/08-offline-privacy.md §3.1.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };
