const multer = require('multer');
const upload = multer();
const {
  createAgreementHandler,
  getAgreements,
  getAgreementHandler,
  updateAgreementAttachments,
  signAgreement,
  cancelAgreement,
} = require(`${global.__controllers}/agreements-controller`);
const { ensureAuth } = require(`${global.__common}/middleware`);
const { sendResponse } = require(`${global.__common}/controller-dependencies`);

// APIs defined according to specification found here -> http://apidocjs.com
module.exports = (app, customMiddleware) => {
  // Use custom middleware if passed, otherwise use plain old middleware
  const middleware = customMiddleware || ensureAuth;

  /* ***********
   * Agreements
   *********** */

  /**
   * @swagger
   *
   * /agreements:
   *   get:
   *     tags:
   *       - "Agreements"
   *     description: >-
   *       Active Agreement information of agreements that are public, or
   *       if the `forCurrentUser` query is set to `true`,
   *       a) are authored by the authenticated user,
   *       b) are authored by an organization to which the authenticated user
   *       belongs,
   *       c) include the authenticated user in its signatories, or
   *       d) include an organization to which the authenticated user belongs in its
   *       signatories
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: forCurrentUser
   *         in: query
   *         description: Optional query string parameter to get all agreements pertaining to the currently logged in user
   *         type: boolean
   *     responses:
   *       '200':
   *         description: json
   *         schema:
   *           type: array
   *           items:
   *             type: object
   *             properties:
   *               address:
   *                 type: string
   *                 description: Active Agreement's address
   *               name:
   *                 type: string
   *                 description: Human readable name of the Active Agreement
   *               archetype:
   *                 type: string
   *                 description: Address of the parent Archetype of the Active Agreement
   *               creator:
   *                 type: string
   *               isPrivate:
   *                 type: boolean
   *                 description: Whether the encryption framework of the Active Agreement
   *               legalState:
   *                 type: boolean
   *               attachmentsFileReference:
   *                 type: string
   *                 description: Hoard grant needed to access an existing event log if any
   *               maxNumberOfAttachments:
   *                 type: number
   *               numberOfParties:
   *                 type: number
   *                 description: The number of parties agreeing to the Active Agreement
   *               formationProcessInstance:
   *                 type: string
   *               executionProcessInstance:
   *                 type: string
   *
   */
  app.get('/agreements', middleware, getAgreements, sendResponse);

  /**
   * @swagger
   *
   * '/agreements/{address}':
   *   get:
   *     tags:
   *       - "Agreements"
   *     description: >-
   *       Active Agreement information for a single Agreement.
   *
   *       Notes:
   *       - If the password provided is incorrect or a hoard reference which
   *       does not exist was passed to the posted Active Agreement this get will
   *       return a `401`.
   *       - If the agreement was not authored by the logged in user or one of their
   *       organizations, or
   *       if its signatories does not include the logged in user or one of their
   *       organizations, this will return a `404`.
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: password
   *         description: |-
   *           The password to trigger the decryption key for an
   *           opaque Agreement
   *         in: query
   *         type: string
   *       - name: address
   *         description: agreement address
   *         in: path
   *         required: true
   *         type: string
   *     responses:
   *       '200':
   *         description: json
   *         schema:
   *           type: object
   *           properties:
   *             address:
   *               type: string
   *               description: Active Agreement's address
   *             name:
   *               type: string
   *               description: Human readable name of the Active Agreement
   *             archetype:
   *               type: string
   *               description: Address of the parent Archetype of the Active Agreement
   *             isPrivate:
   *               type: boolean
   *               description: |-
   *                 Whether the encryption framework of the Active Agreement
   *                 is operational or not
   *             isParty:
   *               type: boolean
   *             isCreator:
   *               type: boolean
   *             isAssignedTask:
   *               type: boolean
   *             maxNumberOfAttachments:
   *               type: number
   *               description: Max number of attachments that can be stored in the attachments
   *             legalState:
   *               type: number
   *               description: Legal state of the agreement
   *             formationProcessInstance:
   *               type: string
   *               description: Address of the agreement's formation process instance
   *             executionProcessInstance:
   *               type: string
   *               description: Address of the agreement's execution process instance
   *             formationProcessDefinition:
   *               type: string
   *             executionProcessDefinition:
   *               type: string
   *             collectionId:
   *               type: string
   *               description: Id of the collection the agreement belongs to
   *             parties:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   address:
   *                     type: string
   *                   signatureTimestamp:
   *                     type: string
   *                   signedBy:
   *                     type: string
   *                   partyDisplayName:
   *                     type: string
   *                   signedByDisplayName:
   *                     type: string
   *               description: >-
   *                 An array of objects with each party member's address,
   *                 user id or organization name, signature timestamp, and address
   *                 of the user that has signed for the party
   *             documents:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                   grant:
   *                     type: string
   *             parameters:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                   value:
   *                     type: string
   *                   type:
   *                     type: integer
   *               description: >-
   *                 An array of objects with each parameter's name, value, and data
   *                 type
   *             governingAgreements:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   address:
   *                     type: string
   *                   name:
   *                     type: string
   *                   isPrivate:
   *                     type: boolean
   *               description: >-
   *                 An array of the governing agreements with the `address`, `name`,
   *                 and `isPrivate` value of each
   *
   */
  app.get('/agreements/:address', middleware, getAgreementHandler, sendResponse);

  /**
   * @swagger
   *
   * /agreements:
   *   post:
   *     tags:
   *       - "Agreements"
   *     description: Create an Agreement
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: body
   *         description: Create an Agreement
   *         in: body
   *         required: true
   *         schema:
   *           type: object
   *           properties:
   *             name:
   *               type: string
   *               description: >-
   *                 Human readable name of the Active Agreement (limit: 32 ASCII
   *                 characters)
   *             archetype:
   *               type: string
   *               description: Address of the parent Archetype of the Active Agreement
   *             isPrivate:
   *               type: boolean
   *               description: |-
   *                 Whether the encryption framework of the Active Agreement
   *                 is operational or not
   *             password:
   *               type: string
   *               description: |-
   *                 A secret string which is used to trigger the encryption
   *                 system for the Active Agreements's documents
   *             maxNumberOfAttachments:
   *               type: integer
   *               description: >-
   *                 The maximum number of attachments to be logged on the Active
   *                 Agreement
   *             parties:
   *               type: array
   *               items:
   *                 type: string
   *               description: The addresses of the parties to the Active Agreement
   *             parameters:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                   value:
   *                     type: string
   *                   type:
   *                     type: integer
   *               description: >-
   *                 The "custom-field-name" and values of the parameters.
   *
   *                 Note - If a parameter with type 8 (Signing Party) is given, the
   *                 corresponding value will be added to the agreement's parties.
   *             governingAgreements:
   *               type: array
   *               items:
   *                 type: string
   *               description: >-
   *                 If parent archetype has any governing archetypes, agreements for
   *                 each one must
   *             collectionId:
   *               type: string
   *               description: >-
   *                 Id of the collection that the agreement is intended to be part
   *                 of if it already exist, and their addresses should be given here.
   *     responses:
   *       '200':
   *         description: json
   *         schema:
   *           type: object
   *           properties:
   *             address:
   *               type: string
   *               description: address of the created Agreement
   *
   */
  app.post('/agreements', middleware, createAgreementHandler, sendResponse);

  /**
   * @swagger
   *
   * /agreements/{address}/attachments:
   *   put:
   *     tags:
   *       - "Agreements"
   *     description: >-
   *       an attachment to the specific agreement.
   *
   *       When requested with `Content-Type: multipart/form-data`, the attached file
   *       will be uploaded to hoard.
   *
   *       The attachment's content will be set to the hoard grant for the file, and
   *       the name will be set to the file's name.
   *
   *       When requested with  `Content-Type: application/json`, the name and
   *       content from the request will be used as the attachment.
   *     produces:
   *       - application/json
   *     parameters:
   *       - name: body
   *         description: Add an attachment to an Agreement
   *         in: body
   *         required: true
   *         schema:
   *           type: object
   *           properties:
   *             name:
   *               type: string
   *               description: Human readable name of the attachment
   *             content:
   *               type: string
   *               description: Description of the attachment
   *       - name: address
   *         description: Agreement address
   *         in: path
   *         required: true
   *         type: string
   *     responses:
   *       '200':
   *         description: json
   *         schema:
   *           type: object
   *           properties:
   *             attachmentsFileReference:
   *               type: string
   *               description: The hoard grant of the updated attachments
   *             attachments:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   name:
   *                     type: string
   *                   submitter:
   *                     type: string
   *                   timestamp:
   *                     type: string
   *                   content:
   *                     type: string
   *                   contentType:
   *                     type: string
   *               description: The updated array of attachments
   *
   */
  app.post('/agreements/:address/attachments', middleware, upload.any(), updateAgreementAttachments, sendResponse);

  /**
   * @swagger
   *
   * /agreements/{address}:
   *   put:
   *     tags:
   *       - "Agreements"
   *     description: Sign an agreement by the authenticated user
   *     produces:
   *       - text/plain
   *     parameters:
   *       - name: address
   *         description: Agreement address
   *         in: path
   *         required: true
   *         type: string
   *     responses:
   *       '200':
   *         description: Sign an Agreement
   *         schema:
   *           type: string
   *
   */
  app.put('/agreements/:address/sign', middleware, signAgreement, sendResponse);

  /**
   * @swagger
   *
   * /agreements/{address}:
   *   put:
   *     tags:
   *       - "Agreements"
   *     description: >-
   *       Cancels an agreement if the authenticated user is a member of the agreement
   *       parties, or a member of an organization that is an agreement party
   *     produces:
   *       - text/plain
   *     parameters:
   *       - name: address
   *         description: Agreement address
   *         in: path
   *         required: true
   *         type: string
   *     responses:
   *       '200':
   *         description: Cancel an Agreement
   *         schema:
   *           type: string
   *
   */
  app.put('/agreements/:address/cancel', middleware, cancelAgreement, sendResponse);
};
