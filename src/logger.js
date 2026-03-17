const config = require('./config.js');

class Logger {
  constructor(config) {
    this.config = config;
  }

  httpLogger = (req, res, next) => {
    // Don't log requests from the logger itself
    if (req.headers['x-pizza-logger']) {
      return next();
    }

    const start = Date.now();
    const { method, path, body: reqBody } = req;

    // Use 'finish' event to log only once when the response is complete
    res.on('finish', () => {
      // Avoid logging our own outgoing calls to Grafana/Factory if they happen to hit this middleware
      if (path.includes('grafana.net') || path.includes('/api/log')) {
        return;
      }

      const logData = {
        authorized: !!req.headers.authorization,
        path,
        method,
        statusCode: res.statusCode,
        reqBody: reqBody,
        // Note: We can't easily get the resBody in 'finish' without hooking send,
        // but using 'finish' prevents the duplication and infinite loop bugs.
        // For JWT Pizza, status and path are the most critical fields.
        latency: `${Date.now() - start}ms`,
      };
      
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
    });

    next();
  };

  dbLogger(query) {
    this.log('info', 'db', query);
  }

  factoryLogger(orderInfo) {
    this.log('info', 'factory', orderInfo);
  }

  unhandledErrorLogger(err) {
    this.log('error', 'unhandledError', { message: err.message, status: err.statusCode });
  }

  log(level, type, logData) {
    const labels = { component: this.config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    logData = JSON.stringify(logData);
    logData = logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
    logData = logData.replace(/\\password\\=\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
    return logData;
  }

  async sendLogToGrafana(event) {
    const body = JSON.stringify(event);

    // Log to factory
    try {
      await fetch(`${this.config.factory.url}/api/log`, {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.factory.apiKey}`,
          'X-Pizza-Logger': 'true', // Prevent self-logging loop
        },
      });
    } catch (error) {
      console.log('Error sending log to factory:', error);
    }

    // Log to Grafana
    try {
      await fetch(`${this.config.logging.url}`, {
        method: 'POST',
        body: body,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(`${this.config.logging.userId}:${this.config.logging.apiKey}`).toString('base64')}`,
          'X-Pizza-Logger': 'true', // Prevent self-logging loop
        },
      });
    } catch (error) {
      console.log('Error sending log to Grafana:', error);
    }
  }
}

const logger = new Logger({
  factory: {
    url: config.factory.url,
    apiKey: config.factory.apiKey,
  },
  logging: {
    url: config.logging.endpointUrl,
    source: config.logging.source,
    userId: config.logging.accountId,
    apiKey: config.logging.apiKey,
  },
});

module.exports = logger;
