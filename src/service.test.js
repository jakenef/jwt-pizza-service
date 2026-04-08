// @ts-check

const request = require("supertest");
const app = require("./service");

test("error responses do not expose stack traces", async () => {
  const res = await request(app)
    .post("/api/auth")
    .set("Content-Type", "application/json")
    .send('{"email":"x@x.com","password":"x"');

  expect(res.status).toBe(400);
  expect(res.body).toHaveProperty("message");
  expect(res.body).not.toHaveProperty("stack");
});
