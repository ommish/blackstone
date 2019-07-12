pragma solidity ^0.4.25;

import "commons-base/BaseErrors.sol";
import "commons-base/SystemOwned.sol";
import "commons-management/AbstractDbUpgradeable.sol";
import "commons-management/ArtifactsRegistry.sol";
import "commons-management/DefaultArtifactsRegistry.sol";

import "agreements/DefaultActiveAgreementRegistry.sol";
import "agreements/DefaultArchetypeRegistry.sol";
import "agreements/ActiveAgreementRegistryDb.sol";
import "agreements/ArchetypeRegistryDb.sol";
import "agreements/DefaultActiveAgreement.sol";
import "agreements/DefaultArchetype.sol";
import "agreements/ArchetypeRegistry.sol";
import "agreements/Agreements.sol";

contract ActiveAgreementRegistryTest {

	string constant SUCCESS = "success";
	bytes32 EMPTY = "";
	string constant functionRegistryCreateAgreement = "createAgreement(address,address,address,string,bool,address[],bytes32,address[])";
	string constant functionRegistryAddAgreementToCollection = "addAgreementToCollection(bytes32,address)";
	string constant functionRegistryAddArchetypeToPackage = "addArchetypeToPackage(bytes32,address)";
	
	address public activeAgreement;
	address public activeAgreement2;
	address public archetypeAddr;
	address public falseAddress = 0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa;
	string dummyPrivateParametersFileRef = "{json grant}";
	uint maxNumberOfEvents = 5;

	address[] parties = [0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC, 0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB, falseAddress];

	bytes32 fakeCollectionId = "ABC123";
	bytes32 leaseCollectionId = "";
	bytes32 leaseCollectionId2 = "";
	bytes32 buildingCollectionId = "";
	bytes32 fakePackageId = "pkg123";
	string packageName = "real package";
	string packageDesc = "real package";
	bytes32 realPackageId = "";

	address[] emptyArray;
	
	address employmentArchetype;
	address employmentAgreement;
	address ndaArchetype;
	address ndaAgreement;
	address benefitsArchetype;
	address benefitsAgreement;
	address[] governingAgreements;
	address[] governingArchetypes;

	ActiveAgreement defaultAgreementImpl = new DefaultActiveAgreement();
	Archetype defaultArchetypeImpl = new DefaultArchetype();
	ArchetypeRegistry archetypeRegistry;
	BpmService bpmService;
	ArtifactsRegistry artifactsRegistry;
	string constant serviceIdArchetypeRegistry = "agreements-network/services/ArchetypeRegistry";

	/**
	 * @dev Constructor for the test creates the dependencies that the ActiveAgreementRegistry needs
	 */
	constructor () public {
		// ArchetypeRegistry
		ArchetypeRegistryDb archRegistryDb = new ArchetypeRegistryDb();
		archetypeRegistry = new DefaultArchetypeRegistry();
		archRegistryDb.transferSystemOwnership(archetypeRegistry);
		require(AbstractDbUpgradeable(archetypeRegistry).acceptDatabase(archRegistryDb), "ArchetypeRegistryDb not set");
		// ArtifactsRegistry
		artifactsRegistry = new DefaultArtifactsRegistry();
        DefaultArtifactsRegistry(address(artifactsRegistry)).initialize();
		artifactsRegistry.registerArtifact(serviceIdArchetypeRegistry, archetypeRegistry, archetypeRegistry.getArtifactVersion(), true);
        artifactsRegistry.registerArtifact(archetypeRegistry.OBJECT_CLASS_ARCHETYPE(), address(defaultArchetypeImpl), defaultArchetypeImpl.getArtifactVersion(), true);
		ArtifactsFinderEnabled(archetypeRegistry).setArtifactsFinder(artifactsRegistry);
	}

	/**
	 * @dev Creates and returns a new ActiveAgreementRegistry using an existing ArchetypeRegistry and BpmService.
	 * This function can be used in the beginning of a test to have a fresh BpmService instance.
	 */
	function createNewAgreementRegistry() internal returns (ActiveAgreementRegistry) {
		DefaultActiveAgreementRegistry newRegistry = new DefaultActiveAgreementRegistry(serviceIdArchetypeRegistry, "NO_BPM_SERVICE"); // Note: the functions in ActiveAgreementRegistry that require a BpmService are not part of this test and therefore the setup of BpmService is skipped!
		ActiveAgreementRegistryDb registryDb = new ActiveAgreementRegistryDb();
		SystemOwned(registryDb).transferSystemOwnership(newRegistry);
		AbstractDbUpgradeable(newRegistry).acceptDatabase(registryDb);
		newRegistry.setArtifactsFinder(artifactsRegistry);
        artifactsRegistry.registerArtifact(newRegistry.OBJECT_CLASS_AGREEMENT(), address(defaultAgreementImpl), defaultAgreementImpl.getArtifactVersion(), true);
		// check that dependencies are wired correctly
		require (address(newRegistry.getArchetypeRegistry()) != address(0), "ArchetypeRegistry in new ActiveAgreementRegistry not found");
		require (address(newRegistry.getArchetypeRegistry()) == address(archetypeRegistry), "ArchetypeRegistry in ActiveAgreementRegistry address mismatch");
		return newRegistry;
	}


	function testActiveAgreementRegistry() external returns (string) {

		address addr;

		ActiveAgreementRegistry agreementRegistry = createNewAgreementRegistry();

    	archetypeAddr = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, emptyArray);

		if (address(agreementRegistry).call(functionRegistryCreateAgreement, 
			address(0), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, emptyArray)) {
				return "Expected error NULL_PARAM_NOT_ALLOWED for empty archetype address";
		}

		activeAgreement = agreementRegistry.createAgreement(archetypeAddr, address(this), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, emptyArray);
		if (activeAgreement == address(0)) return "Agreement creation returned empty address";

		if (agreementRegistry.getActiveAgreementAtIndex(0) != activeAgreement) return "ActiveAgreement at index 0 not as expected";
		if (agreementRegistry.getPartiesByActiveAgreementSize(activeAgreement) != parties.length) return "Parties size on created agreement not correct";
		if (agreementRegistry.getPartyByActiveAgreementAtIndex(activeAgreement, 2) != falseAddress) return "Lookup of party at index 2 on created agreement not correct";

		// test external data retrieval
		address retArchetype;
		address retCreator;
		string memory returnedFileRef;
		bool retIsPrivate;
		(retArchetype, retCreator, returnedFileRef, , , retIsPrivate, , , ) = agreementRegistry.getActiveAgreementData(activeAgreement);
		
		if (retArchetype != archetypeAddr) return "getActiveAgreementData returned wrong archetype";
		if (retCreator != address(this)) return "getActiveAgreementData returned wrong creator";
		if (keccak256(abi.encodePacked(returnedFileRef)) != keccak256(abi.encodePacked(dummyPrivateParametersFileRef))) return "getActiveAgreementData returned wrong private parameters file reference";
		if (retIsPrivate != false) return "getActiveAgreementData returned wrong isPrivate";

		// test external party data retrieval
		uint timestamp;
		(addr, timestamp) = agreementRegistry.getPartyByActiveAgreementData(activeAgreement, falseAddress);
		if (timestamp != 0) return "Party data signature timestamp for false address expected to be 0";

		// test legacy contr

		return SUCCESS;
	}

	function testAgreementCollections() external returns (string) {

		uint error;

		ActiveAgreementRegistry agreementRegistry = createNewAgreementRegistry();
	
		archetypeAddr = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, emptyArray);
		if (archetypeAddr == address(0)) return "Archetype creation returned empty address";

		activeAgreement = agreementRegistry.createAgreement(archetypeAddr, address(this), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, emptyArray);
		if (activeAgreement == address(0)) return "Agreement creation returned empty address";

		if (address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryAddAgreementToCollection, fakeCollectionId, activeAgreement))) {
			return "Expected RESOURCE_NOT_FOUND for non-existent collection id";
		}

		(error, leaseCollectionId) = agreementRegistry.createAgreementCollection(address(0), Agreements.CollectionType.MATTER, fakePackageId);
		if (error != BaseErrors.NULL_PARAM_NOT_ALLOWED()) return "Expected failure due to no author address";
		
		(error, leaseCollectionId) = agreementRegistry.createAgreementCollection(falseAddress, Agreements.CollectionType.MATTER, EMPTY);
		if (error != BaseErrors.NULL_PARAM_NOT_ALLOWED()) return "Expected failure due to no archetype package id";

		(error, leaseCollectionId) = agreementRegistry.createAgreementCollection(falseAddress, Agreements.CollectionType.MATTER, fakePackageId);
		if (error != BaseErrors.NO_ERROR()) return "It should create a new collection";
		if (leaseCollectionId == "") return "Collection id should not be empty";

		if (address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryAddAgreementToCollection, leaseCollectionId, activeAgreement))) {
			return "Expected INVALID_ACTION for collection referencing a package which does not contain the agreement's archetype";
		}

		// creating a real package that contains the archetype for this agreement
		(error, realPackageId) = archetypeRegistry.createArchetypePackage(falseAddress, false, true);
		if (error != BaseErrors.NO_ERROR()) return "Failed to create archetype package via agreementRegistry";
		if (realPackageId == "") return "Archetype package creation had no error, but package id is empty";

		if (!address(archetypeRegistry).call(abi.encodeWithSignature(functionRegistryAddArchetypeToPackage, realPackageId, archetypeAddr))) {
			return "Failed to add archetype to package";
		}

		// creating a new collection that references the new package
		(error, leaseCollectionId2) = agreementRegistry.createAgreementCollection(falseAddress, Agreements.CollectionType.MATTER, realPackageId);
		if (error != BaseErrors.NO_ERROR()) return "Creating a new collection referencing a different archetype package should not fail";
		if (leaseCollectionId2 == "") return "Collection id referenceing the real package should not be empty";

		if (!address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryAddAgreementToCollection, leaseCollectionId2, activeAgreement))) {
			return "Expected to successfully add agreement to collection referencing a package that contains the agreement's archetype";
		}

		if (agreementRegistry.getNumberOfAgreementsInCollection(leaseCollectionId2) != 1) return "Lease collection 2 should have 1 agreement";
		if (agreementRegistry.getAgreementAtIndexInCollection(leaseCollectionId2, 0) != activeAgreement) return "Agreement at index 0 of lease collection 2 should match activeAgreement";
		
		if (agreementRegistry.getNumberOfAgreementCollections() != 2) return "Registry should have 2 collections";

		activeAgreement2 = agreementRegistry.createAgreement(archetypeAddr, address(this), address(this), dummyPrivateParametersFileRef, false, parties, leaseCollectionId2, emptyArray);
		if (activeAgreement2 == address(0)) return "Failed to create a second agreement to put into lease collection 2";

		if (agreementRegistry.getNumberOfAgreementsInCollection(leaseCollectionId2) != 2) return "Lease collection 2 should now have 2 agreements";
		if (agreementRegistry.getAgreementAtIndexInCollection(leaseCollectionId2, 1) != activeAgreement2) return "Agreement at index 1 should match activeAgreement2";

		return SUCCESS;
	}

	function testGoverningAgreements() external returns (string) {
		
		ActiveAgreementRegistry agreementRegistry = createNewAgreementRegistry();

		employmentArchetype = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, emptyArray);

		// trying to create a ndaAgreement with a governing employmentAgreement when the ndaArchetype does not have a governing employmentArchetype should fail
		ndaArchetype = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, emptyArray);
		employmentAgreement = agreementRegistry.createAgreement(employmentArchetype, address(this), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, emptyArray);
		governingAgreements.push(employmentAgreement);
		if (address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryCreateAgreement,
			ndaArchetype, address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, governingAgreements))) {
				return "Expected failure when creating agreement with governing agreements when its archetype has no governing archetypes";
		}

		// trying to create a ndaAgreement with no governing employmentAgreement when the ndaArchetype has a governing employmentArchetype should fail
		governingArchetypes.push(employmentArchetype);
		governingAgreements.length = 0;
		ndaArchetype = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, governingArchetypes);
		if (address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryCreateAgreement,
			ndaArchetype, address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, governingAgreements))) {
				return "Expected failure when creating agreement with governing agreements when its archetype has no governing archetypes";
		}

		// trying to create a ndaAgreement with a unrelated governing agreement when the ndaArchetype has a governing employmentArchetype should fail
		benefitsArchetype = archetypeRegistry.createArchetype(10, false, true, falseAddress, falseAddress, falseAddress, falseAddress, EMPTY, emptyArray);
		benefitsAgreement = agreementRegistry.createAgreement(benefitsArchetype, address(this), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, emptyArray);
		governingAgreements.push(benefitsAgreement);
		if (address(agreementRegistry).call(abi.encodeWithSignature(functionRegistryCreateAgreement,
			ndaArchetype, address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, governingAgreements))) {
				return "Expected failure when creating an agreement with a governing agreement that does not match its governing archetype";
		}

		// trying to create a ndaAgreement with a governing employmentAgreement when the ndaArchetype has a governing employmentArchetype should pass
		governingAgreements.length = 0;
		governingAgreements.push(employmentAgreement);
		ndaAgreement = agreementRegistry.createAgreement(ndaArchetype, address(this), address(this), dummyPrivateParametersFileRef, false, parties, EMPTY, governingAgreements);
		if (ndaAgreement == address(0)) return "Failed to create ndaAgreement with expected governing agreement employmentAgreement";
		
		return SUCCESS;
	}
}
