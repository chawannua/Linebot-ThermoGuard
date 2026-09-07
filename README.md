# Linebot-ThermoGuard

Production deployment instructions:
- Ensure `.env` is configured.
- Push to Heroku.
- The app binds dynamically to `$PORT` to resolve Heroku R10 boot timeout (Fixes Issue #1).
- Updated to use LINE SDK v3.
