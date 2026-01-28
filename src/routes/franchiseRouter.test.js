// @ts-check

const request = require("supertest");
const app = require("../service");

const { createAdminUser, randomName } = require("../utils/test/dataHelpers");

let adminToken, adminUser;

beforeAll(async () => {
  adminUser = await createAdminUser();
  const loginRes = await request(app)
    .put("/api/auth")
    .send({ email: adminUser.email, password: adminUser.password });
  adminToken = loginRes.body.token;
});

test("create franchise", async () => {
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
  };
  const createFranchiseRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(franchise);
  expect(createFranchiseRes.body).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      name: expect.any(String),
      admins: expect.any(Array),
    }),
  );
});
