const Joi = require('@hapi/joi');

const userProfileSchema = Joi.object()
  .keys({
    country: Joi.string().allow('', null),
    region: Joi.string().allow('', null),
    firstName: Joi.string().allow('', null),
    lastName: Joi.string().allow('', null),
    isProducer: Joi.boolean().allow('', null),
    onboarding: Joi.boolean().allow('', null),
    currentPassword: Joi.string().allow('', null),
    newPassword: Joi.string()
      .min(6)
      .allow('', null),
  })
  .with('newPassword', 'currentPassword');

module.exports = userProfileSchema;
