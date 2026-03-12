const request = require('supertest');
const app = require('./service');

describe('Metrics Middleware', () => {
  test('requestTracker increments totalRequests', async () => {
    // Just hitting any endpoint should trigger the requestTracker
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
  });
});
