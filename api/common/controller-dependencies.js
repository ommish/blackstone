const crypto = require('crypto');
const _ = require('lodash');
const boom = require('@hapi/boom');
const logger = require(`${global.__common}/logger`);
const log = logger.getLogger('controllers.dependencies');
const {
  DATA_TYPES,
  PARAMETER_TYPES,
} = global.__constants;

const trimBufferPadding = (buf) => {
  let lo = 0;
  let hi = buf.length;
  for (let i = 0; i < buf.length && buf[i] === 0; i += 1) {
    lo = i + 1;
  }
  for (let i = buf.length - 1; i > 0 && buf[i] === 0; i -= 1) {
    hi = i;
  }
  return buf.slice(lo, hi);
};
const hexToString = (hex = '') => trimBufferPadding(Buffer.from(hex, 'hex')).toString('utf8');
const stringToHex = (str = '') => Buffer.from(str, 'utf8').toString('hex');

/**
 * Wrapper for async route handlers to catch promise rejections
 * and pass them to express error handler
 */
const asyncMiddleware = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (!err.isBoom) {
      return next(boom.badImplementation(err));
    }
    return next(err);
  });
};

const dependencies = {
  rightPad: (hex, len) => {
    const need = 2 * len - hex.length;
    let paddedHex = hex;
    for (let i = 0; i < need; i += 1) {
      paddedHex += '0';
    }
    return paddedHex;
  },

  formatItem: (item) => {
    if (typeof item === 'object') {
      return `'${JSON.stringify(item)}'`;
    }
    if (typeof item === 'string') {
      return `'${item}'`;
    }
    return item;
  },

  /**
   * Formats selected fields of the given object depending on
   * the specified type and returns the object.
   */
  format: (type, obj) => {
    const element = Object.assign({}, obj);
    switch (type) {
      case 'Access Point':
        element.accessPointId = hexToString(element.accessPointId);
        break;
      case 'Archetype':
        if (!_.isEmpty(element.description)) element.description = _.unescape(element.description);
        if (element.successor) element.successor = Number(element.successor) === 0 ? null : element.successor;
        if (element.price) element.price = parseInt(element.price, 10) / 100; // converting to dollars from cents (recorded uint on chain)
        if (Number(element.formationProcessDefinition) === 0) element.formationProcessDefinition = null;
        if (Number(element.executionProcessDefinition) === 0) element.executionProcessDefinition = null;
        break;
      case 'Archetype Package':
        element.active = Boolean(element.active);
        element.isPrivate = Boolean(element.isPrivate);
        break;
      case 'Agreement':
        element.isPrivate = Boolean(element.isPrivate);
        if (Number(element.formationProcessDefinition) === 0) element.formationProcessDefinition = null;
        if (Number(element.executionProcessDefinition) === 0) element.executionProcessDefinition = null;
        break;
      case 'Application':
        element.id = hexToString(element.id);
        element.webForm = hexToString(element.webForm);
        break;
      case 'Country': // TODO Temporary until front-end is updated to rely on alpha2
        element.country = element.alpha2;
        break;
      case 'Currency':
        element.currency = hexToString(element.currency);
        element.alpha3 = hexToString(element.alpha3);
        element.m49 = hexToString(element.m49);
        break;
      case 'Data':
        if (element.dataType === DATA_TYPES.BYTES32) element.value = hexToString(element.value);
        break;
      case 'Data Mapping':
        if (element.accessPath) element.accessPath = hexToString(element.accessPath);
        if (element.dataMappingId) element.dataMappingId = hexToString(element.dataMappingId);
        if (element.dataPath) element.dataPath = hexToString(element.dataPath);
        if (element.dataStorageId) element.dataStorageId = hexToString(element.dataStorageId);
        break;
      case 'Parameter':
        element.name = hexToString(element.name);
        element.label = hexToString(element.label);
        break;
      case 'Party':
        if (element.signatureTimestamp) element.signatureTimestamp *= 1000;
        if (element.organizationName) element.organizationName = hexToString(element.organizationName);
        break;
      case 'Model':
        if ('active' in element) element.active = element.active === 1;
        element.isPrivate = Boolean(element.isPrivate);
        break;
      case 'Region':
        element.country = hexToString(element.country);
        element.alpha2 = hexToString(element.alpha2);
        element.code2 = hexToString(element.code2);
        element.code3 = hexToString(element.code3);
        break;
      case 'Definition':
        if (element.processDefinitionId != null) element.processDefinitionId = hexToString(element.processDefinitionId);
        if (element.interfaceId != null) element.interfaceId = hexToString(element.interfaceId);
        if (element.modelId != null) element.modelId = hexToString(element.modelId);
        element.isPrivate = Boolean(element.isPrivate);
        break;
      case 'ParameterType':
        element.label = hexToString(element.label || '');
        break;
      case 'Parameter Value': {
        if (element.type === PARAMETER_TYPES.MONETARY_AMOUNT) {
          element.value /= 100;
        }
        return element;
      }
      default:
        log.warn('Invoked format() function with unknown type. Returning same object!');
    }
    return element;
  },

  encrypt: (buffer, password) => {
    if (password == null) return buffer;
    const cipher = crypto.createCipher('aes-256-ctr', password);
    const crypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return crypted;
  },

  decrypt: (buffer, password) => {
    if (password == null) return buffer;
    const decipher = crypto.createDecipher('aes-256-ctr', password);
    const dec = Buffer.concat([decipher.update(buffer), decipher.final()]);
    return dec;
  },

  addMeta: (meta, data) => {
    const dataBuf = Buffer.from(data);
    const metaBuf = Buffer.from(JSON.stringify(meta));
    const size = Buffer.alloc(4);
    size.writeUIntBE(metaBuf.length, 0, 4);
    return Buffer.concat([size, metaBuf, dataBuf]);
  },

  splitMeta: (data) => {
    const _data = data.data;
    let retdata;
    try {
      const outSize = _data.readUIntBE(0, 4);
      retdata = {
        meta: JSON.parse(_data.slice(4, outSize + 4).toString()),
        data: _data.slice(outSize + 4),
      };
    } catch (err) {
      retdata = { data: _data };
    }
    return retdata;
  },

  where: (queryParams) => {
    /* Notes:
      - all values in `req.query` come in as strings, so column type is cast to string for query
      - query values containing commas will be split to perform a WHERE IN query
      - query values will be numbered starting at $1, so if additional queries should be added AFTER these ones
      - if no query is given, returns 'TRUE' so it can be inserted into a query without any issues
      - query keys in camelCase will be converted to snake_case in returned query string to match db table column name format
    */
    let queryString = '';
    const queryVals = [];
    if (!queryParams || !Object.keys(queryParams).length) return { queryString: 'TRUE', queryVals };
    Object.keys(queryParams).forEach((key) => {
      let formatted = queryParams[key];
      if (typeof formatted === 'string' && formatted.includes(',')) {
        formatted = queryParams[key].split(',');
      }
      if (queryString) queryString = queryString.concat(' AND ');
      const isArray = Array.isArray(formatted);
      queryString = queryString.concat(`${_.snakeCase(key)}::text ${isArray ? 'IN ' : '= '}`);
      queryString = queryString.concat(`${isArray ? ` (${formatted.map((__, i) => `$${queryVals.length + i + 1}`)})` : `$${queryVals.length + 1}`}`);
      if (isArray) {
        queryVals.push(...formatted);
      } else {
        queryVals.push(formatted);
      }
    });
    return { queryString, queryVals };
  },

  pgUpdate: (tableName, obj) => {
    let columns = Object.keys(obj);
    const values = columns.map(col => obj[col]);
    columns = columns.map(col => _.snakeCase(col));
    const text = `UPDATE ${tableName} SET ${columns.map((col, i) => `${col} = $${i + 1}`).join(', ')}`;
    return {
      text,
      values,
    };
  },

  byteLength: string => string.split('').reduce((acc, el) => {
    const newSum = acc + Buffer.byteLength(el, 'utf8');
    return newSum;
  }, 0),

  getBooleanFromString: (val) => {
    if (val && val.constructor.name === 'Boolean') return val;
    if (val && val.constructor.name === 'String') {
      return val === 'true';
    }
    return false;
  },

  getSHA256Hash: data => crypto.createHash('sha256').update(data).digest('hex'),

  prependHttps: (host) => {
    if (!String(host).startsWith('http')) {
      // eslint-disable-next-line no-param-reassign
      host = process.env.APP_ENV === 'local' ? `http://${host}` : `https://${host}`;
      return host;
    }
    return host;
  },

  sendResponse: asyncMiddleware((req, res, next) => {
    if (res.statusCode === 302) {
      if (!res.locals.data || typeof res.locals.data !== 'string') throw boom.badImplementation('Bad or empty url. Cannot redirect');
      res.redirect(res.locals.data);
    } else if (typeof res.locals.data === 'string') {
      res.json(res.locals.data);
    } else {
      // `.send` will detect Arrays and Objects and use `.json` under the hood
      res.send(res.locals.data);
    }
    return next();
  }),

  trimBufferPadding,
  hexToString,
  stringToHex,
  asyncMiddleware,
};

module.exports = dependencies;
