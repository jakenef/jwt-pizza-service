const request = require('supertest');

// Mock os before requiring metrics
const os = require('os');
jest.mock('os');

// Mock database to prevent real connections and logs
jest.mock('./database/database', () => ({
  DB: {
    addUser: jest.fn(),
    getUser: jest.fn(),
    getUsers: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
    getConnection: jest.fn(),
  },
  Role: {
    Admin: 'admin',
    Diner: 'diner',
  },
}));

// Mock fetch for Grafana reporting
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

let app;
let metrics;

describe('Metrics', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.isolateModules(() => {
      app = require('./service');
      metrics = require('./metrics');
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    os.loadavg.mockReturnValue([0.1, 0.2, 0.3]);
    os.cpus.mockReturnValue([{}, {}]);
    os.totalmem.mockReturnValue(1000);
    os.freemem.mockReturnValue(500);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('Middleware', () => {
    test('requestTracker records endpoint latency and auth attempts', async () => {
      await request(app).get('/');
      await request(app).post('/api/auth').send({ email: 'test@test.com', password: 'password' });
      await request(app).post('/api/auth').send({ email: 'test@test.com', password: 'wrong' });

      jest.advanceTimersByTime(10000);
      
      expect(global.fetch).toHaveBeenCalled();
      const lastCallBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      const reportedMetrics = lastCallBody.resourceMetrics[0].scopeMetrics[0].metrics;
      
      expect(reportedMetrics.some(m => m.name === 'request')).toBe(true);
      expect(reportedMetrics.some(m => m.name === 'endpointLatency')).toBe(true);
    });

    test('requestTracker tracks active users', async () => {
        await request(app).get('/');

        jest.advanceTimersByTime(10000);
        const lastCallBody = JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);
        const reportedMetrics = lastCallBody.resourceMetrics[0].scopeMetrics[0].metrics;
        const activeUsersMetric = reportedMetrics.find(m => m.name === 'activeUsers');
        
        expect(activeUsersMetric).toBeDefined();
    });
  });

  describe('recordPizzaSale', () => {
    test('records successful pizza sale', () => {
      metrics.recordPizzaSale(true, 10.5, 100);
      
      jest.advanceTimersByTime(10000);
      const lastCallBody = JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);
      const reportedMetrics = lastCallBody.resourceMetrics[0].scopeMetrics[0].metrics;
      
      const sold = reportedMetrics.find(m => m.name === 'pizzasSold');
      const revenue = reportedMetrics.find(m => m.name === 'pizzaRevenue');
      
      expect(sold.sum.dataPoints[0].asInt).toBeGreaterThanOrEqual(1);
      expect(revenue.sum.dataPoints[0].asDouble).toBeGreaterThanOrEqual(10.5);
    });

    test('records failed pizza sale', () => {
      metrics.recordPizzaSale(false, 0, 50);
      
      jest.advanceTimersByTime(10000);
      const lastCallBody = JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);
      const reportedMetrics = lastCallBody.resourceMetrics[0].scopeMetrics[0].metrics;
      
      const failures = reportedMetrics.find(m => m.name === 'pizzaFailures');
      expect(failures.sum.dataPoints[0].asInt).toBeGreaterThanOrEqual(1);
    });
  });

  describe('System Metrics', () => {
      test('reports cpu and memory usage', () => {
          jest.advanceTimersByTime(10000);
          const lastCallBody = JSON.parse(global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1].body);
          const reportedMetrics = lastCallBody.resourceMetrics[0].scopeMetrics[0].metrics;
          
          const cpu = reportedMetrics.find(m => m.name === 'cpuUsage');
          const memory = reportedMetrics.find(m => m.name === 'memoryUsage');
          
          expect(cpu.gauge.dataPoints[0].asDouble).toBe(5); 
          expect(memory.gauge.dataPoints[0].asDouble).toBe(50);
      });
  });

  describe('Error Handling', () => {
      test('sendMetricToGrafana handles fetch error', async () => {
          const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
          global.fetch.mockImplementationOnce(() => Promise.reject('network error'));
          
          jest.advanceTimersByTime(10000);
          
          // Flush microtasks multiple times to let the promise chain resolve
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();
          
          expect(consoleSpy).toHaveBeenCalledWith('Error pushing metrics:', 'network error');
          consoleSpy.mockRestore();
      });

      test('sendMetricToGrafana handles non-ok response', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 500 }));
        
        jest.advanceTimersByTime(10000);
        
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        
        expect(consoleSpy).toHaveBeenCalledWith('Error pushing metrics:', expect.any(Error));
        consoleSpy.mockRestore();
    });
  });
});
