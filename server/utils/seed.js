const bcrypt = require('bcryptjs');
const { readUsers, writeUsers } = require('./userStore');

const email = process.argv[2] || 'admin@divyanshicapital.com';
const password = process.argv[3] || 'ChangeMe123!';
const name = process.argv[4] || 'Admin';
const role = process.argv[5] || 'admin';

const users = readUsers();
if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
  console.log(`User ${email} already exists.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
users.push({
  id: Date.now().toString(36),
  email,
  passwordHash,
  name,
  role,
  createdAt: new Date().toISOString(),
});
writeUsers(users);

console.log(`Seeded user ${email} with role "${role}". Change the password after first login.`);
