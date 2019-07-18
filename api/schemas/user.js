const Joi = require('@hapi/joi');

/*

sample user:
{
  username: 'username',
  email: 'myemail@company.com',
  password: 'hello1234',
}
*/

const userSchema = Joi.object().keys({
  username: Joi.string()
    .max(255, 'utf8')
    .regex(/^[a-zA-Z0-9-_.@&+]+$/)
    .required(),
  email: Joi.string()
    .max(255, 'utf8')
    .email()
    .required(),
  firstName: Joi.string()
    .max(255, 'utf8')
    .required(),
  lastName: Joi.string()
    .max(255, 'utf8')
    .required(),
  password: Joi.string()
    .min(6)
    .max(255, 'utf8')
    .required(),
  confirmPassword: Joi.string().allow(null),
  isProducer: Joi.boolean().default(false),
});

module.exports = userSchema;
