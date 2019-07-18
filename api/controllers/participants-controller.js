const boom = require('@hapi/boom');
const bcrypt = require('bcryptjs');
const Joi = require('@hapi/joi');
const _ = require('lodash');
const crypto = require('crypto');
const sendgrid = require('@sendgrid/mail');
sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
const db = require('./postgres-query-helper');

const {
  pgUpdate,
  asyncMiddleware,
  getSHA256Hash,
  prependHttps,
} = require(`${global.__common}/controller-dependencies`);
const contracts = require('./contracts-controller');
const logger = require(`${global.__common}/logger`);
const log = logger.getLogger('controllers.participants');
const pool = require(`${global.__common}/postgres-db`);
const { DEFAULT_DEPARTMENT_ID } = require(`${global.__common}/constants`);
const userSchema = require(`${global.__schemas}/user`);
const userProfileSchema = require(`${global.__schemas}/userProfile`);
const { PARAMETER_TYPES: PARAM_TYPE } = global.__constants;

const participantHelpers = {};

participantHelpers.createOrganization = async (organization, userAddress) => {
  const org = Object.assign({}, organization);
  log.info(`Request to create new organization: ${org.name}`);
  if (!org.name) throw boom.badRequest('Organization name is required');
  if (org.name > 255) throw boom.badRequest('Organization name length cannot exceed 255 characters');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = await db.insertOrganization(null, org.name, client);
    if (!org.approvers || org.approvers.length === 0) {
      log.debug(`No approvers provided for new organization. Setting current user ${userAddress} as approver.`);
      org.approvers = [userAddress];
    }
    const defDepId = getSHA256Hash(DEFAULT_DEPARTMENT_ID);
    org.defaultDepartmentId = defDepId;
    const address = await contracts.createOrganization(org);
    await db.updateOrganization(id, address, org.name, client);
    await db.insertDepartmentDetails({
      organizationAddress: address,
      id: defDepId,
      name: org.defaultDepartmentName || DEFAULT_DEPARTMENT_ID,
    }, client);
    await client.query('COMMIT');
    log.info('Added organization name and address to postgres');
    return { address, name: org.name };
  } catch (err) {
    await client.query('ROLLBACK');
    if (boom.isBoom(err)) throw err;
    throw boom.badImplementation(err);
  } finally {
    client.release();
  }
};

participantHelpers.addDepartmentUsers = async (orgAddress, depId, users, userAddress) => {
  const authorized = await db.userIsOrganizationApprover(orgAddress, userAddress);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to remove users');
  }
  const addUserPromises = users.map(user => contracts.addDepartmentUser(orgAddress, depId, user, userAddress));
  await Promise.all(addUserPromises)
    .catch((err) => {
      if (boom.isBoom(err)) throw err;
      throw boom.badImplementation(err);
    });
};

const getParticipantNames = async (participants, addressKey = 'address') => {
  try {
    const withNames = await db.getParticipantNames(participants.map(({ [addressKey]: address }) => address));
    const names = {};
    withNames.forEach(({ address, displayName }) => {
      names[address] = { displayName };
    });
    return participants.map(account => Object.assign({}, account, names[account[addressKey]] || {}));
  } catch (err) {
    throw boom.badImplementation(err);
  }
};

const getOrganizations = asyncMiddleware(async (req, res, next) => {
  if (req.query.approver === 'true') {
    req.query.approver_address = req.user.address;
    delete req.query.approver;
  }
  try {
    const data = await db.getOrganizations(req.query);
    // Vent query has join that results in multiple rows for each org
    // Consolidate data by storing in object 'aggregated'
    const aggregated = {};
    data.forEach(({
      address, name, organizationKey, approver,
    }) => {
      if (!aggregated[address]) {
        aggregated[address] = {
          address, name, organizationKey, approvers: [],
        };
      }
      aggregated[address].approvers.push(approver);
    });
    res.locals.data = Object.values(aggregated);
    res.status(200);
    return next();
  } catch (err) {
    if (boom.isBoom(err)) throw err;
    throw boom.badImplementation(err);
  }
});

const getOrganization = asyncMiddleware(async (req, res, next) => {
  try {
    const data = await db.getOrganization(req.params.address);
    // Vent query has left join that results in multiple rows for the org for each approver, user, department, and department member
    // Consolidate data by storing approvers and users in objects
    let approvers = {};
    let users = {};
    let departments = {};
    const departmentUsers = {};
    data.forEach(({
      approver, approverName, user, userName, department, departmentName, departmentUser,
    }) => {
      if (approver && !approvers[approver]) {
        approvers[approver] = { address: approver, username: approverName };
      }
      if (user && !users[user]) {
        users[user] = { address: user, username: userName, departments: [] };
      }
      if (department && !departments[department]) {
        departments[department] = { id: department, name: departmentName, users: [] };
        departmentUsers[department] = {};
      }
      if (departmentUser && !departmentUsers[department][departmentUser]) {
        departments[department].users.push(departmentUser);
        users[user].departments.push(department);
        departmentUsers[department][departmentUser] = true;
      }
    });
    approvers = Object.values(approvers);
    users = Object.values(users);
    departments = Object.values(departments);
    if (!approvers.find(({ address }) => address === req.user.address) && !users.find(({ address }) => address === req.user.address)) {
      throw boom.forbidden('User is not an approver or member of this organization and not allowed access');
    }
    const { address, name, organizationKey } = data[0];
    const org = {
      address, organizationKey, name, approvers, users, departments,
    };
    res.locals.data = org;
    res.status(200);
    return next();
  } catch (err) {
    if (boom.isBoom(err)) throw err;
    throw boom.badImplementation(err);
  }
});

const createOrganization = asyncMiddleware(async (req, res, next) => {
  res.locals.data = await participantHelpers.createOrganization(req.body, req.user.address);
  res.status(200);
  next();
});

const updateOrganization = asyncMiddleware(async (req, res, next) => {
  try {
    if (!req.body.name) throw boom.badRequest('Organization name is required.');
    if (req.body.name.length > 255) throw boom.badRequest('Organization name cannot be longer than 255 characters.');
    const isApprover = await db.userIsOrganizationApprover(req.params.address, req.user.address);
    if (!isApprover) throw boom.forbidden(`User ${req.user.address} does not have sufficient privileges to update organization ${req.params.address}`);
    await db.updateOrganization(null, req.params.address, req.body.name);
    res.status(200);
    return next();
  } catch (err) {
    if (boom.isBoom(err)) throw err;
    throw boom.badImplementation(err);
  }
});

const createOrganizationUserAssociations = asyncMiddleware(async (req, res, next) => {
  const authorized = await db.userIsOrganizationApprover(req.params.address, req.user.address);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to add users');
  }
  const { users } = req.body;
  const addUserPromises = users.map(user => contracts.addUserToOrganization(user, req.params.address, req.user.address));
  await Promise.all(addUserPromises);
  res.status(200);
  return next();
});

const deleteOrganizationUserAssociation = asyncMiddleware(async (req, res, next) => {
  const authorized = await db.userIsOrganizationApprover(req.params.address, req.user.address);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to remove users');
  }
  await contracts.removeUserFromOrganization(req.params.userAddress, req.params.address, req.user.address);
  res.status(200);
  return next();
});

const addApproversToOrganization = asyncMiddleware(async (req, res, next) => {
  const { users } = req.body;
  const addApproverPromises = users.map(user => contracts.addApproverToOrganization(user, req.params.address, req.user.address));
  await Promise.all(addApproverPromises);
  res.status(200);
  return next();
});

const removeApproverFromOrganization = asyncMiddleware(async (req, res, next) => {
  await contracts.removeApproverFromOrganization(req.params.userAddress, req.params.address, req.user.address);
  res.status(200);
  return next();
});

const createDepartment = asyncMiddleware(async (req, res, next) => {
  const { name, users = [] } = req.body;
  const { address } = req.params;
  if (!name) {
    throw boom.badRequest('Name is required for department');
  } else if (name.length > 255) {
    throw boom.badRequest('Name length cannot exceed 255 characters');
  }
  const authorized = await db.userIsOrganizationApprover(address, req.user.address);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to remove users');
  }
  const id = getSHA256Hash(`${req.user.address}${name}${Date.now()}`).toUpperCase();
  await contracts.createDepartment(address, id, req.user.address);
  await db.insertDepartmentDetails({ organizationAddress: address, id, name });
  // Optionally also add users in the same request
  const addUserPromises = users.map(user => contracts.addDepartmentUser(address, id, user, req.user.address));
  await Promise.all(addUserPromises)
    .then(() => {
      res.locals.data = { id, name, users };
      res.status(200);
      return next();
    }).catch((err) => {
      if (boom.isBoom(err)) throw err;
      throw boom.badImplementation(err);
    });
});

const removeDepartment = asyncMiddleware(async (req, res, next) => {
  const { address, id } = req.params;
  const authorized = await db.userIsOrganizationApprover(address, req.user.address);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to remove users');
  }
  await contracts.removeDepartment(address, id, req.user.address);
  await db.removeDepartmentDetails({ organizationAddress: address, id });
  res.status(200);
  return next();
});

const addDepartmentUsers = asyncMiddleware(async (req, res, next) => {
  await participantHelpers.addDepartmentUsers(req.params.address, req.params.id, req.body.users, req.user.address);
  res.status(200);
  next();
});

const removeDepartmentUser = asyncMiddleware(async (req, res, next) => {
  const { address, id, userAddress } = req.params;
  const authorized = await db.userIsOrganizationApprover(address, req.user.address);
  if (!authorized) {
    throw boom.forbidden('User is not an approver of the organization and not authorized to remove users');
  }
  await contracts.removeDepartmentUser(address, id, userAddress, req.user.address);
  res.status(200);
  return next();
});

const _userExistsOnChain = async (username) => {
  try {
    await contracts.getUserByUsername(getSHA256Hash(username));
    return true;
  } catch (err) {
    if (err.output.statusCode === 404) {
      return false;
    }
    throw boom.badImplementation(err);
  }
};

const upgradeExternalUser = async ({
  username,
  email,
  firstName,
  lastName,
  passwordDigest,
  isProducer,
}) => {
  try {
    const user = db.upgradeExternalUser({
      username, firstName, lastName, passwordDigest, isProducer, email,
    });
    await contracts.addUserToEcosystem(getSHA256Hash(username), user.address);
    return user;
  } catch (err) {
    if (err.isBoom) throw err;
    throw boom.badImplementation(`Failed to upgrade external user to regular user: ${err.stack}`);
  }
};

const registerUser = async (userData) => {
  let address;
  let userId;
  let existingEmail;
  let isExternalUser; // indicates user already exists as "external user"
  const { error, value } = Joi.validate(userData, userSchema, { abortEarly: false });
  if (error) throw boom.badRequest(`Required fields missing or malformed: ${error}`);
  const {
    username, email, firstName, lastName, password, isProducer,
  } = value;
  // check if email or username already registered in pg
  try {
    const user = await db.getUserByUsernameOrEmail({ email, username });
    if (user) existingEmail = user.email;
    isExternalUser = user && user.externalUser && user.email === email.toLowerCase();
    if (user && !isExternalUser) {
      if (user.email === email.toLowerCase()) {
        throw boom.badData(`Email ${email} already registered`);
      } else if (user.username === username.toLowerCase()) {
        throw boom.badData(`Username ${username} already registered`);
      }
    }
  } catch (err) {
    if (err.isBoom) throw err;
    throw boom.badImplementation(`Failed to validate if username already registered : ${err.stack}`);
  }

  if (!isExternalUser) {
    // check if username is registered on chain
    try {
      const userInCache = await _userExistsOnChain(username);
      if (userInCache) throw boom.badData(`Username ${username} already exists`);
    } catch (err) {
      if (err.isBoom) throw err;
      throw boom.badImplementation(`Failed to validate if user exists on chain: ${err.stack}`);
    }

    // create user on chain
    try {
      address = await contracts.createUser({ username: getSHA256Hash(username) });
    } catch (err) {
      throw boom.badImplementation(`Failed to create user on chain: ${err.stack}`);
    }
  }
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  if (isExternalUser) {
    ({ id: userId, address } = await upgradeExternalUser({
      username,
      email: existingEmail,
      firstName,
      lastName,
      passwordDigest:
      passwordHash,
      isProducer,
    }));
  } else {
    // insert in user db
    try {
      userId = await db.insertUser(address, username, firstName, lastName, email, passwordHash, isProducer);
    } catch (err) {
      throw boom.badImplementation(`Failed to save user in db: ${err.stack}`);
    }
  }

  // generate and persist activation code
  const codeHash = crypto.createHash('sha256');
  const activationCode = crypto.randomBytes(32).toString('hex');
  codeHash.update(activationCode);
  try {
    await db.insertUserActivationCode(userId, codeHash.digest('hex'));
    log.info(`Saved activation code ${activationCode} for user at address ${address}`);
  } catch (err) {
    throw boom.badImplementation(`Failed to save user activation code: ${err.stack}`);
  }

  return {
    address, username, email, activationCode,
  };
};

const sendUserActivationEmail = async (userEmail, senderEmail, webappName, apiUrl, activationCode) => {
  const message = {
    to: userEmail,
    from: `${senderEmail}`,
    subject: `${webappName} - Activate Account`,
    text: `Your account has been successfully created on the ${webappName}. In order to login please activate your user account by clicking <a href="${apiUrl}/users/activate/${activationCode}">here</a>.`,
    html: `Your account has been successfully created on the ${webappName}. In order to login please activate your user account by clicking <a href="${apiUrl}/users/activate/${activationCode}">here</a>.`,
  };
  await sendgrid.send(message);
};

const registrationHandler = asyncMiddleware(async ({ body }, res, next) => {
  const result = await registerUser(body);
  if (process.env.WEBAPP_EMAIL && process.env.WEBAPP_URL && process.env.SENDGRID_API_KEY) {
    await sendUserActivationEmail(
      result.email,
      process.env.WEBAPP_EMAIL,
      process.env.WEBAPP_NAME,
      prependHttps(process.env.API_URL),
      result.activationCode,
    );
  }
  res.locals.data = {
    address: result.address,
    username: result.username,
  };
  res.status(200);
  return next();
});

const activateUser = asyncMiddleware(async (req, res, next) => {
  const hash = crypto.createHash('sha256');
  log.info(`Activation request received with code: ${req.params.activationCode}`);
  hash.update(req.params.activationCode);
  const codeHex = hash.digest('hex');
  const rows = await db.getUserByActivationCode(codeHex);
  let redirectHost = process.env.WEBAPP_URL;
  if (!String(redirectHost).startsWith('http')) {
    redirectHost = process.env.APP_ENV === 'local' ? `http://${redirectHost}` : `https://${redirectHost}`;
  }
  if (!rows.length) {
    log.error(`Activation code ${req.params.activationCode} does not match any user account`);
    res.locals.data = `${redirectHost}/?tokenExpired=true`;
    res.status(302);
    return next();
  }
  try {
    await db.updateUserActivation(rows[0].address, rows[0].userId, true, codeHex);
    log.info(`Successfully activated user at ${rows[0].address}`);
    res.locals.data = `${redirectHost}/?activated=true`;
    res.status(302);
    return next();
  } catch (err) {
    log.error(`Failed to activate user account at ${rows[0].address}: ${err}`);
    res.locals.data = `${redirectHost}/help`;
    res.status(302);
    return next();
  }
});

const getUsers = asyncMiddleware(async (req, res, next) => {
  res.locals.data = await db.getUsers();
  res.status(200);
  return next();
});

const getProfile = asyncMiddleware(async (req, res, next) => {
  if (!req.user.address) throw boom.badRequest('No logged in user found');
  const userAddress = req.user.address;
  const data = await db.getProfile(userAddress);
  const user = { address: userAddress };
  // Multiple rows returned because of left join for organization departments.
  // Consolidating data in object.
  const organizations = {};
  data.forEach(({
    organization, organizationName, organizationKey, department, departmentName,
  }) => {
    if (organization && !organizations[organization]) {
      organizations[organization] = {
        address: organization, name: organizationName, organizationKey, departments: [],
      };
    }
    if (department) {
      organizations[organization].departments.push({ id: department, name: departmentName });
    }
  });
  user.organizations = Object.values(organizations);
  delete user.organization;
  try {
    const userData = await db.getUserByIdType({ idType: 'address', id: userAddress });
    res.locals.data = _.merge(user, userData);
    res.status(200);
    return next();
  } catch (err) {
    return next(boom.badImplementation(`Failed to get profile data for user at ${userAddress}: ${err}`));
  }
});

const editProfile = asyncMiddleware(async (req, res, next) => {
  const userAddress = req.user.address;
  const { error } = Joi.validate(req.body, userProfileSchema, { abortEarly: false });
  if (error) throw boom.badRequest(`Required fields missing or malformed: ${error}`);
  if (req.body.email || req.body.username) throw boom.notAcceptable('Email and username cannot be changed');
  if (req.body.password) throw boom.notAcceptable('Password can only be updated by providing currentPassword and newPassword fields');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (req.body.newPassword) {
      const { rows } = await client.query({
        text: `SELECT password_digest FROM ${global.db.schema.app}.users WHERE address = $1`,
        values: [userAddress],
      });
      const { password_digest: pwDigest } = rows[0];
      const isPassword = await bcrypt.compare(req.body.currentPassword, pwDigest);
      if (!isPassword) throw boom.forbidden('Invalid password provided');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(req.body.newPassword, salt);
      req.body.passwordDigest = hash;
    }
    delete req.body.currentPassword;
    delete req.body.newPassword;
    const { text, values } = pgUpdate(`${global.db.schema.app}.users`, req.body);
    values.push(userAddress);
    await client.query({
      text: `${text} WHERE address = $${values.length}`,
      values,
    });
    await client.query('COMMIT');
    client.release();
    res.locals.data = { address: userAddress };
    res.status(200);
    return next();
  } catch (err) {
    client.query('ROLLBACK');
    client.release();
    if (err.isBoom) return next(err);
    return next(boom.badImplementation(`Error editing profile: ${err}`));
  }
});

const createOrFindAccountsWithEmails = async (params, typeKey) => {
  const newParams = [];
  const withEmail = [];
  const forNewUser = {};
  params.forEach((param, index) => {
    newParams[index] = { ...param };
    if (
      (param[typeKey] === PARAM_TYPE.USER_ORGANIZATION || param[typeKey] === PARAM_TYPE.SIGNING_PARTY)
      && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i.test(param.value)
    ) {
      // Need to get user address from email
      withEmail.push({ ...param, index });
    }
  });
  if (!withEmail.length) return { parameters: newParams, newUsers: [] };
  const client = await pool.connect();
  try {
    const { rows } = await client.query({
      text: `SELECT LOWER(email) AS email, address FROM ${global.db.schema.app}.users WHERE LOWER(email) IN (${withEmail.map((param, i) => `LOWER($${i + 1})`)});`,
      values: withEmail.map(({ value }) => value),
    });
    withEmail.forEach((param) => {
      const emailAddr = param.value.toLowerCase();
      const existingUser = rows.find(({ email }) => emailAddr === email);
      if (existingUser) {
        // Use existing accounts info if email already registered
        newParams[param.index].value = existingUser.address;
      } else if (forNewUser[emailAddr]) {
        // Consolidate users that need to be registered into obj in case the same email was entered for multiple parameters
        // Also save the parameters that each email was used for
        forNewUser[emailAddr].push(param);
      } else {
        forNewUser[emailAddr] = [param];
      }
    });
    const createNewUserPromises = (Object.keys(forNewUser)).map(async (email) => {
      // Create user on chain
      const address = await contracts.createUser({ username: getSHA256Hash(email) });
      const password = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      // Create user in db
      const queryString = `INSERT INTO ${global.db.schema.app}.users(
        address, username, email, password_digest, is_producer, external_user
        ) VALUES(
          $1, $2, $3, $4, $5, $6
          );`;
      await client.query({ text: queryString, values: [address, email, email, hash, false, true] });
      return { email, address };
    });
    const newUsers = await Promise.all(createNewUserPromises);
    Object.keys(forNewUser).forEach((emailAddr) => {
      const { address } = newUsers.find(({ email }) => email === emailAddr);
      forNewUser[emailAddr].forEach((param) => { newParams[param.index].value = address; });
    });
    // Release client
    client.release();
    // Return all parameters
    return {
      parameters: newParams,
      newUsers,
    };
  } catch (err) {
    client.release();
    if (boom.isBoom(err)) throw err;
    throw boom.badImplementation(err);
  }
};

module.exports = {
  participantHelpers,
  getParticipantNames,
  getOrganizations,
  getOrganization,
  createOrganization,
  updateOrganization,
  createOrganizationUserAssociations,
  deleteOrganizationUserAssociation,
  addApproversToOrganization,
  removeApproverFromOrganization,
  createDepartment,
  removeDepartment,
  addDepartmentUsers,
  removeDepartmentUser,
  getUsers,
  getProfile,
  editProfile,
  registrationHandler,
  registerUser,
  activateUser,
  createOrFindAccountsWithEmails,
};
