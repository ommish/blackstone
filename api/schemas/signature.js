const Joi = require('@hapi/joi');
/*
sample signature:
{
  signature: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAADElEQVQImWNgoBMAAABpAAFEI8ARAAAAAElFTkSuQmCC',
  firstName: 'Joe',
  lastName: 'Smith',
  company: 'Joe Smith and Sons and Daughters',
  title: 'CEO',
  email: 'joe@smithandsonsanddaughters.com',
  address: '10 Company St. New York, NY 10018',
  date: 1554326702120,
  ip: '127.0.0.1',
};
*/

const signatureSchema = Joi.object().keys({
  signature: Joi.string().required(),
  firstName: Joi.string()
    .required()
    .max(255, 'utf8'),
  lastName: Joi.string()
    .required()
    .max(255, 'utf8'),
  userAddress: Joi.string()
    .hex()
    .required(),
  company: Joi.string()
    .allow('')
    .optional()
    .max(255, 'utf8'),
  title: Joi.string()
    .allow('')
    .optional()
    .max(255, 'utf8'),
  email: Joi.string()
    .required()
    .max(255, 'utf8'),
  address: Joi.string()
    .allow('')
    .optional()
    .max(255, 'utf8'),
  date: Joi.number()
    .required()
    .min(0),
  ip: Joi.string().default(''),
});

module.exports = signatureSchema;
