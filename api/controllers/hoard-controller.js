const {
  addMeta,
  splitMeta,
  asyncMiddleware,
} = require(`${global.__common}/controller-dependencies`);
const boom = require('@hapi/boom');
const Hoard = require('@monax/hoard');
const hoard = new Hoard.Client(global.__settings.hoard);

const hoardPut = (metadata, data) => new Promise((resolve, reject) => {
  const plaintext = {
    Plaintext: {
      Data: addMeta(metadata, data),
      Salt: Buffer.from(process.env.HOARD_SALT),
    },
    GrantSpec: {
      Symmetric: {
        PublicID: Buffer.from(process.env.PUBLIC_ID, 'utf8'),
      },
    },
  };
  hoard
    .putseal(plaintext)
    .then((response) => {
      const grant = JSON.stringify(hoard.base64ify(response));
      return resolve(grant);
    })
    .catch(err => reject(boom.badImplementation(err)));
});

const hoardPutApiHandler = asyncMiddleware(async (req, res) => {
  const meta = {
    name: req.files[0].originalname,
    mime: req.files[0].mimetype,
  };
  const grant = await hoardPut(meta, req.files[0].buffer);
  res.status(200).json({ grant });
});

const hoardGet = grant => new Promise((resolve, reject) => {
  const _grant = JSON.parse(grant);
  hoard
    .unsealget(_grant)
    .then(response => resolve({ data: response.Data }))
    .catch(err => reject(boom.badImplementation(err)));
});

const hoardGetApiHandler = asyncMiddleware(async (req, res) => {
  const data = await hoardGet(req.query.grant);
  const response = splitMeta(data);
  if (req.query.meta === 'true') {
    res.status(200).send(response);
  } else {
    res.attachment(response.meta.name);
    res.status(200).send(response.data);
  }
});

module.exports = {
  hoard,
  hoardPut,
  hoardPutApiHandler,
  hoardGet,
  hoardGetApiHandler,
};
