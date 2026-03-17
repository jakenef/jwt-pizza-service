const config = require('./config.js');

class Logger {
  constructor(config) {
    this.config = config;
  }

  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
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
      const res = await fetch(`${this.config.factory.url}/api/log`, {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.factory.apiKey}`,
        },
      });
      if (!res.ok) {
        const resText = await res.text();
        console.log(`Failed to send log to factory: ${res.status} ${resText}`);
      }
    } catch (error) {
      console.log('Error sending log to factory:', error);
    }

    // Log to Grafana
    try {
      const res = await fetch(`${this.config.logging.url}`, {
        method: 'post',
        body: body,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${this.config.logging.userId}:${this.config.logging.apiKey}`).toString('base64')}`,
        },
      });
      if (!res.ok) {
        console.log('Failed to send log to Grafana');
      }
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
