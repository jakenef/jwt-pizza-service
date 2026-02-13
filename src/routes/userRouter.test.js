// @ts-check

const request = require("supertest");
const app = require("../service");
const { expectValidJwt } = require("../utils/test/expectHelpers");
const { registerUser } = require("../utils/test/dataHelpers");

const testUser = { name: "pizza diner", email: "reg@test.com", password: "a" };
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

test("list users unauthorized", async () => {
  const listUsersRes = await request(app).get("/api/user");
  expect(listUsersRes.status).toBe(401);
});

test("list users", async () => {
  const [user, userToken] = await registerUser(request(app));
  user.toString(); // make linter ignore
  const listUsersRes = await request(app)
    .get("/api/user")
    .set("Authorization", "Bearer " + userToken);
  expect(listUsersRes.status).toBe(200);
});

test("list users functionality: returns users, paginates, filters by name", async () => {
  // Register multiple users
  const users = [];
  for (let i = 0; i < 5; i++) {
    const [user, token] = await registerUser(request(app));
    users.push({ user, token });
  }

  const authToken = users[0].token;

  // 1. List all users (default pagination)
  const resAll = await request(app)
    .get("/api/user?page=1&limit=10")
    .set("Authorization", `Bearer ${authToken}`);
  expect(resAll.status).toBe(200);
  expect(Array.isArray(resAll.body.users)).toBe(true);
  expect(resAll.body.users.length).toBeGreaterThanOrEqual(5);
  expect(resAll.body).toHaveProperty("more");

  // 2. Pagination: limit=2, page=1 (more may be true if >2 users)
  const resPage1 = await request(app)
    .get("/api/user?page=1&limit=2")
    .set("Authorization", `Bearer ${authToken}`);
  expect(resPage1.status).toBe(200);
  expect(resPage1.body.users.length).toBeLessThanOrEqual(2);
  expect(typeof resPage1.body.more).toBe("boolean");

  // 3. Pagination: limit=2, page=2
  const resPage2 = await request(app)
    .get("/api/user?page=2&limit=2")
    .set("Authorization", `Bearer ${authToken}`);
  expect(resPage2.status).toBe(200);
  expect(resPage2.body.users.length).toBeLessThanOrEqual(2);
  expect(typeof resPage2.body.more).toBe("boolean");

  // 4. Name filter: use a known user's name
  const filterName = users[1].user.name;
  const resFilter = await request(app)
    .get(`/api/user?page=1&limit=10&name=${encodeURIComponent(filterName)}`)
    .set("Authorization", `Bearer ${authToken}`);
  expect(resFilter.status).toBe(200);
  expect(resFilter.body.users.some((u) => u.name === filterName)).toBe(true);
  expect(typeof resFilter.body.more).toBe("boolean");

  // Clean up: delete created users
  for (const { user } of users) {
    await request(app).delete(`/api/user/${user.id}`);
  }
});
