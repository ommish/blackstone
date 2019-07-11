pragma solidity ^0.4.25;

import "commons-base/ErrorsLib.sol";
import "commons-management/AbstractVersionedArtifact.sol";
import "commons-auth/AbstractPermissioned.sol";

import "agreements/Archetype.sol";
import "agreements/ActiveAgreement.sol";
import "agreements/AbstractActiveAgreement_v1_0_1.sol";

/**
 * @title DefaultActiveAgreement
 * @dev Default implementation of the ActiveAgreement interface. This contract represents the latest "version" of the artifact by inheriting from past versions to guarantee the order
 * of storage variable declarations. It also inherits and instantiates AbstractVersionedArtifact.
 */
contract DefaultActiveAgreement is AbstractVersionedArtifact(1,3,0), AbstractActiveAgreement_v1_0_1, AbstractPermissioned, ActiveAgreement {

	/**
	 * @dev Legacy initialize function that is not supported anymore in this version of DefaultArchetype and will always revert.
	 * param _archetype archetype address
	 * param _creator the account that created this agreement
	 * param _privateParametersFileReference the file reference to the private parameters (optional)
	 * param _isPrivate if agreement is private
	 * param _parties the signing parties to the agreement
	 * param _governingAgreements array of agreement addresses which govern this agreement (optional)
	 */
	function initialize(
		address /*_archetype*/,
		address /*_creator*/,
		string /*_privateParametersFileReference*/,
		bool /*_isPrivate*/,
		address[] /*_parties*/,
		address[] /*_governingAgreements*/)
		external
	{
		revert(ErrorsLib.format(ErrorsLib.INVALID_STATE(),
		"DefaultActiveAgreement.initialize(address,address,string,bool,address[],address[])",
		"This version of initialize is no longer supported. Please use DefaultActiveAgreement.initialize(address,address,address,string,bool,address[],address[])"));
	}

	/**
	 * @dev Initializes this ActiveAgreement with the provided parameters. This function replaces the
	 * contract constructor, so it can be used as the delegate target for an ObjectProxy.
	 * @param _archetype archetype address
	 * @param _creator the account that created this agreement
	 * @param _owner the account that owns this agreement
	 * @param _privateParametersFileReference the file reference to the private parameters (optional)
	 * @param _isPrivate if agreement is private
	 * @param _parties the signing parties to the agreement
	 * @param _governingAgreements array of agreement addresses which govern this agreement (optional)
	 */
	function initialize(
		address _archetype, 
		address _creator, 
		address _owner, 
		string _privateParametersFileReference, 
		bool _isPrivate, 
		address[] _parties, 
		address[] _governingAgreements)
		external
		pre_post_initialize
	{
		ErrorsLib.revertIf(_creator == address(0),
			ErrorsLib.NULL_PARAMETER_NOT_ALLOWED(), "DefaultActiveAgreement.initialize", "The provided creator address must not be empty");
		ErrorsLib.revertIf(_owner == address(0),
			ErrorsLib.NULL_PARAMETER_NOT_ALLOWED(), "DefaultActiveAgreement.initialize", "The provided owner address must not be empty");
		ErrorsLib.revertIf(_archetype == address(0),
			ErrorsLib.NULL_PARAMETER_NOT_ALLOWED(), "DefaultActiveAgreement.initialize", "Archetype address must not be empty");
		ErrorsLib.revertIf(!Archetype(_archetype).isActive(),
			ErrorsLib.INVALID_PARAMETER_STATE(), "DefaultActiveAgreement.initialize", "Archetype must be active");
		
		validateGoverningAgreements(_governingAgreements, Archetype(_archetype).getGoverningArchetypes());

    	addInterfaceSupport(ERC165_ID_Address_Scopes);

		archetype = _archetype;
		creator = _creator;
		if (bytes(_privateParametersFileReference).length > 0) {
			fileReferences.insertOrUpdate(fileKeyPrivateParameters, _privateParametersFileReference);
		}
		privateFlag = _isPrivate;
		parties = _parties;
		governingAgreements = _governingAgreements;
		legalState = Agreements.LegalState.FORMULATED; //TODO we currently don't support a negotiation phase in the AN, so the agreement's prose contract is already formulated when the agreement is created.

		permissions[ROLE_ID_OWNER].multiHolder = false;
		permissions[ROLE_ID_OWNER].revocable = false;
		permissions[ROLE_ID_OWNER].transferable = true;
		permissions[ROLE_ID_OWNER].exists = true;
		permissions[ROLE_ID_OWNER].holders.length = 1;
		permissions[ROLE_ID_OWNER].holders[0] = _owner;

		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].multiHolder = true;
		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].revocable = true;
		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].transferable = false;
		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].exists = true;
		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].holders.length = 1;
		permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].holders[0] = _owner;

		// NOTE: some of the parameters for the event must be read from storage, otherwise "stack too deep" compilation errors occur
		emit LogAgreementCreation_v1_1_0(
			EVENT_ID_AGREEMENTS,
			address(this),
			_archetype,
			_creator,
      		_owner,
			_privateParametersFileReference,
			"",
			_isPrivate,
			uint8(legalState),
			maxNumberOfEvents
		);
		for (uint i = 0; i < _parties.length; i++) {
			emit LogActiveAgreementToPartySignaturesUpdate(EVENT_ID_AGREEMENT_PARTY_MAP, address(this), _parties[i], address(0), uint(0));
		}
		for (i = 0; i < _governingAgreements.length; i++) {
			emit LogGoverningAgreementUpdate(EVENT_ID_GOVERNING_AGREEMENT, address(this), _governingAgreements[i]);
		}
	}

	/**
	 * @dev Returns the owner
	 * @return the owner address or an empty address if not set
	 */
	function getOwner() external view returns (address) {
    	return permissions[ROLE_ID_OWNER].holders.length > 0 ? permissions[ROLE_ID_OWNER].holders[0] : address(0);
	}

	/**
     * @dev Sets the legal state of this agreement to Agreements.LegalState.FULFILLED.
	 * !overwrite! AbstractActiveAgreement.setFulfilled()
	 * !deprecated!can only be invoked for contracts that don't have the ROLE_ID_LEGAL_STATE_CONTROLLER
	 */
	function setFulfilled() external {
		// ErrorsLib.revertIf(permissions[ROLE_ID_LEGAL_STATE_CONTROLLER].exists,
		// 	ErrorsLib.INVALID_STATE(), "DefaultActiveAgreement.setFulfilled()",
		// 	"Calling this function is only supported for legacy contracts. Use setLegalState(Agreements.LegalState instead.");
        legalState = Agreements.LegalState.FULFILLED;
        emit LogAgreementLegalStateUpdate(EVENT_ID_AGREEMENTS, address(this), uint8(legalState));
	}

}
