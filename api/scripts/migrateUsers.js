// External dependencies
/* eslint-disable */
const fs = require('fs')
const toml = require('toml')
const path = require('path')
const _ = require('lodash')
const monax = require('@monax/burrow')
const crypto = require('crypto');

// Set up global directory constants
global.__common = path.resolve(__dirname, '../', 'common')
global.__config = path.resolve(__dirname, '../', 'config')
global.__controllers = path.resolve(__dirname, '../', 'controllers')
global.__abi = path.resolve(__dirname, '../', 'public-abi')

global.__monax_constants = require(path.join(__common, 'monax-constants'));
const { hexToString, stringToHex } = require(`${global.__common}/controller-dependencies`);
global.hexToString = hexToString;
global.stringToHex = stringToHex;

(async function () {
  // Read configuration
  const configFilePath = process.env.MONAX_CONFIG || __config + '/settings.toml'
  global.__settings = (() => {
    let settings = toml.parse(fs.readFileSync(configFilePath))
    if (process.env.CHAIN_URL_GRPC) _.set(settings, 'monax.chain.url', process.env.CHAIN_URL_GRPC);
    if (process.env.MONAX_ACCOUNTS_SERVER_KEY) _.set(settings, 'monax.accounts.server', process.env.MONAX_ACCOUNTS_SERVER_KEY)
    if (process.env.MONAX_CONTRACTS_LOAD) _.set(settings, 'monax.contracts.load', process.env.MONAX_CONTRACTS_LOAD)
    if (process.env.MONAX_BUNDLES_PATH) _.set(settings, 'monax.bundles.bundles_path', process.env.MONAX_BUNDLES_PATH)
    _.set(
      settings,
      'db.app_db_url',
      `postgres://${process.env.POSTGRES_DB_USER}:${process.env.POSTGRES_DB_PASSWORD}@${process.env.POSTGRES_DB_HOST}:${process.env.POSTGRES_DB_PORT}/${process.env.POSTGRES_DB_DATABASE}`,
    );
    _.set(settings, 'db.app_db_schema', process.env.POSTGRES_DB_SCHEMA);
    _.set(
      settings,
      'db.chain_db_url',
      `postgres://${process.env.POSTGRES_DB_USER}:${process.env.POSTGRES_DB_PASSWORD}@${process.env.POSTGRES_DB_HOST}:${process.env.POSTGRES_DB_PORT}/${process.env.POSTGRES_DB_DATABASE}`,
    );
    _.set(settings, 'db.chain_db_schema', process.env.POSTGRES_DB_SCHEMA_VENT);
    return settings
  })()

  global.__monax_bundles = require(path.join(__common, 'monax-constants')).MONAX_BUNDLES

  const logger = require(__common + '/monax-logger')
  const log = logger.getLogger('monax')

  const { app_db_pool, chain_db_pool } = require(__common + '/postgres-db');
  log.info('Postgres DB pools created.')

  const contracts = require(__controllers + '/contracts-controller')
  let client

  try {
    client = await app_db_pool.connect()
    await client.query('BEGIN')

    // Check if 'users' table exists; exit if it doesn't
    const { rows: usersTable } = await client.query({ text: "SELECT table_name FROM information_schema.tables WHERE table_name='users'" })
    if (!usersTable[0]) {
      log.info('No users table found in DB')
      return
    }
    await contracts.load()
    log.info('Contracts loaded.')

    const { rows: usersInDB } = await client.query({
      text: 'SELECT username FROM users'
    })
    // Check if any users are in the database; exit if there are none
    if (!usersInDB.length) {
      log.info('No users to update.')
      return
    }
    log.info('Creating new users on chain')
    const promises = usersInDB.map(async ({ username }) => {
      try {
        // See if user already exists on chain first, and if they do, just return the existing address
        // This is in case this script is run after users have signed up on the new chain
        const hashedUsername = crypto.createHash('sha256').update(username).digest('hex');
        const { address } = await contracts.getUserByUsername(hashedUsername)
        log.info(`User ${username} already exists at address: ${address}`)
        return new Promise((resolve) => resolve({}))
      } catch (err) {
        // If not, create a new user on chain and return the new address; mark this as a new user
        return contracts.createUser({ username: crypto.createHash('sha256').update(username).digest('hex') }).then((address) => {
          return { username, address, newUser: true }
        })
      }
    })
    const usersInChain = await Promise.all(promises)

    // All 'new' users have an invalid address in the DB
    // Set invalid addresses to the user's username (temporarily, this will be set to the new address later)
    // This is to prevent DB errors if we try updating with a duplicate address
    const newUsers = usersInChain.filter(({ newUser }) => newUser)
    let text = `UPDATE users SET address = CONCAT('TEMP', username) WHERE username = ANY ($1)`
    let values = [newUsers.map(({ username }) => username)]
    await client.query({
      text,
      values
    })

    // Update the database with the new addresses
    text = `UPDATE users SET address = CASE username ${newUsers.map((_, i) => `WHEN $${i + 1} THEN $${i + 1 + newUsers.length}`).join(' ')} END`
    values = newUsers.map(({ username }) => username).concat(newUsers.map(({ address }) => `${address}`))
    await client.query({
      text,
      values
    })

    // Remove all stored organizations
    await client.query({
      text: 'DELETE FROM organizations',
    })
    log.info('All organizations removed')

    await client.query('COMMIT')
    log.info(`Completed DB update.`)
    return
  } catch (err) {
    if (client) await client.query('ROLLBACK')
    log.error('Error migrating users to chain: ' + err)
  } finally {
    if (client) client.release()
    process.exit()
  }
})()
