// @ts-check

const request = require("supertest");
const app = require("../service");
const { createAdminUser, randomName } = require("../utils/test/dataHelpers");

let adminToken, franchiseId, storeId, menuId;

beforeAll(async () => {
  const adminUser = await createAdminUser();
  const loginRes = await request(app)
    .put("/api/auth")
    .send({ email: adminUser.email, password: adminUser.password });
  adminToken = loginRes.body.token;
  const franchise = {
    name: randomName(),
    admins: [{ email: adminUser.email }],
  };
  const createFranchiseRes = await request(app)
    .post("/api/franchise")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(franchise);
  franchiseId = createFranchiseRes.body.id;
  const store = {
    franchiseId,
    name: randomName(),
  };
  const createStoreRes = await request(app)
    .post(`/api/franchise/${franchiseId}/store`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send(store);
  storeId = createStoreRes.body.id;
  const newItem = {
    title: "Student",
    description: "Just carbs",
    image: "pizza9.png",
    price: 0.0001,
  };
  const createMenuRes = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(newItem);
  const menu = createMenuRes.body;
  menuId = menu.find((item) => item.title === "Student").id;
});

test("add menu item", async () => {
  const newItem = {
    title: "Student",
    description: "Just carbs",
    image: "pizza9.png",
    price: 0.0001,
  };
  const res = await request(app)
    .put("/api/order/menu")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(newItem);

  expect(res.status).toBe(200);
  expect(res.body).toEqual(
    expect.arrayContaining([expect.objectContaining(newItem)]),
  );
});

test("get menu", async () => {
  const getMenuRes = await request(app).get("/api/order/menu");
  expect(getMenuRes.body).toHaveProperty("length");
});

test("create order", async () => {
  const orderReq = {
    franchiseId,
    storeId,
    items: [{ menuId, description: "Just carbs", price: 0.0001 }],
  };
  const res = await request(app)
    .post("/api/order")
    .set("Authorization", `Bearer ${adminToken}`)
    .send(orderReq);

  expect(res.body).toMatchObject({
    order: {
      franchiseId,
      storeId,
      items: [{ menuId, description: "Just carbs", price: 0.0001 }],
    },
  });
});
