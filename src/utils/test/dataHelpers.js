// @ts-check

const { Role, DB } = require("../../database/database.js");

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  const name = randomName();
  let user = {
    name,
    email: name + "@admin.com",
    password: "toomanysecrets",
    roles: [{ role: Role.Admin }],
  };

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

async function registerUser(service) {
  const testUser = {
    name: "pizza diner",
    email: `${randomName()}@test.com`,
    password: "a",
  };
  const registerRes = await service.post("/api/auth").send(testUser);
  registerRes.body.user.password = testUser.password;

  return [registerRes.body.user, registerRes.body.token];
}

module.exports = { randomName, createAdminUser, registerUser };
