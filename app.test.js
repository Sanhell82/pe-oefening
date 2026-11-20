const request = require('supertest');
const app = require('./app');

describe('GET /hello', () => {
  it('should return HELLO PXL', async () => {
    const response = await request(app).get('/hello');
    expect(response.status).toBe(200);
    expect(response.text).toBe('HELLO PXL');
  });
});
