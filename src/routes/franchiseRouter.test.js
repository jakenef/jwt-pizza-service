// @ts-check

const request = require("supertest");
const app = require("../service");

const { createAdminUser, randomName } = require("../utils/test/dataHelpers");

let adminToken, adminUser, franchiseId, storeId;

beforeAll(async () => {
  adminUser = await createAdminUser();
  const loginRes = await request(app)
    .put("/api/auth")
    .send({ email: adminUser.email, password: adminUser.password });
  adminToken = loginRes.body.token;

  // Create franchise for store tests
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
  };
  const createFranchiseRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(franchise);
  franchiseId = createFranchiseRes.body.id;

  // Create store for delete tests
  const store = { franchiseId, name: randomName() };
  const createStoreRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(store);
  storeId = createStoreRes.body.id;
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
  franchiseId = createFranchiseRes.body.id;
});

test("create store", async () => {
  const store = {
    franchiseId,
    name: randomName(),
  };
  const createStoreRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(store);
  expect(createStoreRes.body).toEqual(
    expect.objectContaining({
      id: expect.any(Number),
      franchiseId: expect.any(Number),
      name: expect.any(String),
    }),
  );
});

test("delete store", async () => {
  const res = await request(app)
    .delete(`/api/franchise/${franchiseId}/store/${storeId}`)
    .set("Authorization", `Bearer ${adminToken}`);

  expect(res.body).toEqual({ message: "store deleted" });
});

test("delete franchise", async () => {
  const res = await request(app).delete(`/api/franchise/${franchiseId}`);

  expect(res.body).toEqual({ message: "franchise deleted" });
});
