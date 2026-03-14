const config = require("./config");
const os = require("os");

const methodRequests = {};
const activeUsers = new Map(); // Map of userId -> lastActivityTimestamp
let authSuccess = 0;
let authFailure = 0;
let pizzasSold = 0;
let pizzaRevenue = 0;
let pizzaFailures = 0;
let endpointLatencyTotal = 0;
let endpointLatencyCount = 0;
let pizzaLatencyTotal = 0;
let pizzaLatencyCount = 0;

function requestTracker(req, res, next) {
  const start = Date.now(); // latency timer

  const method = req.method;
  methodRequests[method] = (methodRequests[method] || 0) + 1;

  if (req.user) {
    activeUsers.set(req.user.id, Date.now());
  }

  next();

  res.on("finish", () => {
    const latency = Date.now() - start;
    endpointLatencyTotal += latency;
    endpointLatencyCount++;

    if (
      (method === "POST" || method === "PUT") &&
      req.originalUrl.startsWith("/api/auth")
    ) {
      if (res.statusCode < 400) {
        authSuccess++;
      } else {
        authFailure++;
      }
    }
  });
}

function recordPizzaSale(success, price, latency = 0) {
  if (success) {
    pizzasSold++;
    pizzaRevenue += price;
    pizzaLatencyTotal += latency;
    pizzaLatencyCount++;
  } else {
    pizzaFailures++;
    if (latency > 0) {
      pizzaLatencyTotal += latency;
      pizzaLatencyCount++;
    }
  }
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return parseFloat((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return parseFloat(memoryUsage.toFixed(2));
}

setInterval(() => {
  const metrics = [];

  // 1. Report Requests by Method
  Object.keys(methodRequests).forEach((method) => {
    metrics.push(
      createMetric("request", methodRequests[method], "1", "sum", "asInt", {
        method: method,
      }),
    );
  });

  // 2. Report Active Users (Last 5 Minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [userId, lastActivity] of activeUsers) {
    if (lastActivity < fiveMinutesAgo) {
      activeUsers.delete(userId);
    }
  }
  metrics.push(
    createMetric("activeUsers", activeUsers.size, "1", "sum", "asInt", {}),
  );

  // 3. Report Auth Attempts
  metrics.push(
    createMetric("authAttempt", authSuccess, "1", "sum", "asInt", {
      result: "success",
    }),
  );
  metrics.push(
    createMetric("authAttempt", authFailure, "1", "sum", "asInt", {
      result: "failure",
    }),
  );

  // 4. Report System Metrics
  metrics.push(
    createMetric(
      "cpuUsage",
      getCpuUsagePercentage(),
      "1",
      "gauge",
      "asDouble",
      {},
    ),
  );
  metrics.push(
    createMetric(
      "memoryUsage",
      getMemoryUsagePercentage(),
      "1",
      "gauge",
      "asDouble",
      {},
    ),
  );

  // 5. Report Pizza Metrics
  metrics.push(createMetric("pizzasSold", pizzasSold, "1", "sum", "asInt", {}));
  metrics.push(
    createMetric("pizzaRevenue", pizzaRevenue, "1", "sum", "asDouble", {}),
  );
  metrics.push(
    createMetric("pizzaFailures", pizzaFailures, "1", "sum", "asInt", {}),
  );

  // 6. Report Latency Metrics
  const avgEndpointLatency =
    endpointLatencyCount > 0 ? endpointLatencyTotal / endpointLatencyCount : 0;
  metrics.push(
    createMetric(
      "endpointLatency",
      avgEndpointLatency,
      "ms",
      "gauge",
      "asDouble",
      {},
    ),
  );
  endpointLatencyTotal = 0;
  endpointLatencyCount = 0;

  const avgPizzaLatency =
    pizzaLatencyCount > 0 ? pizzaLatencyTotal / pizzaLatencyCount : 0;
  metrics.push(
    createMetric(
      "pizzaLatency",
      avgPizzaLatency,
      "ms",
      "gauge",
      "asDouble",
      {},
    ),
  );
  pizzaLatencyTotal = 0;
  pizzaLatencyCount = 0;

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes,
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = { requestTracker, recordPizzaSale };
