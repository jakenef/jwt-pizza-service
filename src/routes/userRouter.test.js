// @ts-check

const request = require("supertest");
const app = require("../service");
const { expectValidJwt } = require("../utils/test/expectHelpers");
const { createAdminUser } = require("../utils/test/dataHelpers");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
const adminUser = createAdminUser();
let testUserAuthToken;
let testUserId;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + "@test.com";
  const registerRes = await request(app).post("/api/auth").send(testUser);
  testUserAuthToken = registerRes.body.token;
  testUserId = registerRes.body.user.id;
  expectValidJwt(testUserAuthToken);
});

test("get user", async () => {
  const getUserRes = await request(app)
    .get("/api/user/me")
    .set("Authorization", `Bearer ${testUserAuthToken}`);

  const user = getUserRes.body;
  expect(user).toMatchObject({ name: testUser.name, email: testUser.email });
});

test("update user", async () => {
  const updateUserRes = await request(app)
    .put(`/api/user/${testUserId}`)
    .set("Authorization", `Bearer ${testUserAuthToken}`)
    .send({ ...testUser, email: "new@mail.com" });

  const user = updateUserRes.body.user;
  const token = updateUserRes.body.token;

  expectValidJwt(token);
  expect(user).toMatchObject({ name: testUser.name, email: "new@mail.com" });
});

test("delete user", async () => {
  const deleteUserRes = await request(app).delete(`/api/user/${testUserId}`);
  expect(deleteUserRes).toBeDefined();
});
