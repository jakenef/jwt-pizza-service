const config = require("./config");

const methodRequests = {};
const activeUsers = new Map(); // Map of userId -> lastActivityTimestamp

function requestTracker(req, res, next) {
  const method = req.method;
  methodRequests[method] = (methodRequests[method] || 0) + 1;

  if (req.user) {
    activeUsers.set(req.user.id, Date.now());
  }

  next();
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

module.exports = { requestTracker };
