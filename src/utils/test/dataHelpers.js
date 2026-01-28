// @ts-check

const { Role, DB } = require("../../database/database.js");

function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

async function createAdminUser() {
  const name = randomName();
  let user = { name, email: name + "@admin.com", password: "toomanysecrets", roles: [{ role: Role.Admin }] };

  user = await DB.addUser(user);
  return { ...user, password: "toomanysecrets" };
}

module.exports = { randomName, createAdminUser };
