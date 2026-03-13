const config = require("./config");

let totalRequests = 0;
const endpointRequests = {};

function requestTracker(req, res, next) {
  totalRequests++;
  const endpoint = req.path;
  const method = req.method;
  const key = `${method} ${endpoint}`;

  if (!endpointRequests[key]) {
    endpointRequests[key] = { count: 0, method, endpoint };
  }
  endpointRequests[key].count++;
  next();
}

setInterval(() => {
  const metrics = [
    createMetric("request", totalRequests, "1", "sum", "asInt", {
      type: "total",
    }),
  ];

  Object.keys(endpointRequests).forEach((key) => {
    const data = endpointRequests[key];
    metrics.push(
      createMetric("request", data.count, "1", "sum", "asInt", {
        type: "endpoint",
        endpoint: data.endpoint,
        method: data.method,
      }),
    );
  });

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
