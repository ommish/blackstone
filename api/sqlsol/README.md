# Event Log Table

The `event_log` table created by vent is an append-only log table containing events of interest and their payload spread out into their constituent columns. Events of interest are configured by adding a filter in the spec for the table. Currently filtering on the Log1Text (the indexed eventId field in the event) matching the following values:

- AN://agreements
- AN://archetypes
- AN://activity-instances
- AN://process-instances
- AN://user-accounts

The above eventIds map to the following events:

Agreements:

- LogAgreementMaxEventCountUpdate
- LogAgreementEventLogReference
- LogAgreementSignatureLogReference
- LogAgreementLegalStateUpdate
- LogAgreementFormationProcessUpdate
- LogAgreementExecutionProcessUpdate

Archetypes:

- LogArchetypePriceUpdate
- LogArchetypeSuccessorUpdate
- LogArchetypeActivation
- LogArchetypeOwnerUpdate

Activity Instances:

- LogActivityInstanceCreation
- LogActivityInstanceCompletion
- LogActivityInstanceStateUpdate
- LogActivityInstanceStateAndPerformerUpdate
- LogActivityInstanceStateAndTimestampUpdate

Process Instances:

- LogProcessInstanceCreation
- LogProcessInstanceStateUpdate

User Accounts:

- LogUserCreation
