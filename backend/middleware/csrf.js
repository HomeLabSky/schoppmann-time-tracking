/**
 * CSRF-Schutz für die Cookie-Anmeldung.
 *
 * Ändernde Anfragen (POST/PUT/PATCH/DELETE) müssen den Header `X-CSRF-Protection: 1` enthalten. Eine fremde
 * Webseite kann diesen Header nicht setzen (Browser verlangen dafür eine CORS-Freigabe, die nur die eigene
 * Oberfläche bekommt). Zusätzlich sind die Cookies `SameSite=Strict` und das Backend verlangt JSON als Content-Type.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const requireCsrfHeader = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('X-CSRF-Protection') !== '1') {
    return res.status(403).json({
      success: false,
      error: 'Anfrage abgelehnt (fehlender Sicherheits-Header)',
      code: 'CSRF_HEADER_MISSING'
    });
  }
  next();
};

module.exports = { requireCsrfHeader };
