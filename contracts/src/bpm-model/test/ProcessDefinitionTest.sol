pragma solidity ^0.4.25;

import "commons-base/BaseErrors.sol";
import "commons-utils/TypeUtilsLib.sol";
import "commons-collections/AbstractDataStorage.sol";

import "bpm-model/ProcessDefinition.sol";
import "bpm-model/DefaultProcessModel.sol";

contract ProcessDefinitionTest {
	
	using TypeUtilsLib for bytes32;

	string constant SUCCESS = "success";
	string constant functionSigCreateTransition = "createTransition(bytes32,bytes32)";
	string constant functionSigCreateTransitionConditionForAddress = "createTransitionConditionForAddress(bytes32,bytes32,bytes32,bytes32,address,uint8,address)";
	string constant functionSigCreateIntermediateEvent = "createIntermediateEvent(bytes32,uint8,uint8,bytes32,bytes32,address,uint256)";
	string constant functionSigAddBoundaryEvent = "addBoundaryEvent(bytes32,bytes32,uint8,uint8,bytes32,bytes32,address,uint256)";
	string constant functionSigAddBoundaryEventAction = "addBoundaryEventAction(bytes32,bytes32,bytes32,address,address,string)";
	string constant functionSigCancel = "cancel()";

	// test data
	bytes32 activity1Id = "activity1";
	bytes32 activity2Id = "activity2";
	bytes32 activity3Id = "activity3";
	bytes32 activity4Id = "activity4";
	bytes32 activity5Id = "activity5";
	bytes32 intermediateEvent1Id = "event1";
	bytes32 boundaryEvent1Id = "boundaryEvent1";
	bytes32 transition1Id = "transition1";
	bytes32 gateway1Id = "gateway1";
	bytes32 gateway2Id = "gateway2";
	address assignee1 = 0x1040e6521541daB4E7ee57F21226dD17Ce9F0Fb7;
	address assignee2 = 0x58fd1799aa32deD3F6eac096A1dC77834a446b9C;
	address assignee3 = 0x68112f9380f75a13f6Ce2d5923F1dB8386EF1339;
	address assignee4 = 0x776FDe59876aAB7D654D656e654Ed9876574c54c;
	address author = 0x9d7fDE63776AaB9E234d656E654ED9876574C54C;
	bytes32 participantId1 = "Participant1";

	bytes32 pId;
	bytes32 pInterface;
	bytes32 modelId;
	string dummyModelFileReference = "{json grant}";
	bytes32 EMPTY = "";
	string constant EMPTY_STRING = "";

	/**
	 * @dev Tests building of the ProcessDefinition and checking for validity along the way
	 */
	function testProcessDefinition() external returns (string) {
	
		//                               boundaryEvent1
		//                              /                
		// Graph: activity1 -> activity2 -> XOR SPLIT -/---------------> XOR JOIN -> intermediateEvent1 -> activity4
		//                                            \                /                               
		//                                             \-> activity3 -/

		// re-usable test variables
		uint error;

		ProcessModel pm = new DefaultProcessModel();
		pm.initialize("testModel", [1,0,0], author, false, dummyModelFileReference);
		ProcessDefinition pd = new DefaultProcessDefinition();
		pd.initialize("p1", address(pm));
		
		// test process interface handling
		error = pd.addProcessInterfaceImplementation(pm, "AgreementFormation");
		if (error != BaseErrors.RESOURCE_NOT_FOUND()) return "Expected error for adding non-existent process interface.";
		error = pm.addProcessInterface("AgreementFormation");
		if (error != BaseErrors.NO_ERROR()) return "Unable to add process interface Formation to model";
		error = pm.addProcessInterface("AgreementExecution");
		if (error != BaseErrors.NO_ERROR()) return "Unable to add process interface Execution to model";
		error = pd.addProcessInterfaceImplementation(pm, "AgreementFormation");
		if (error != BaseErrors.NO_ERROR()) return "Unable to add valid process interface Formation to process definition.";
		error = pd.addProcessInterfaceImplementation(pm, "AgreementExecution");
		if (error != BaseErrors.NO_ERROR()) return "Unable to add valid process interface Execution to process definition.";
		if (pd.getNumberOfImplementedProcessInterfaces() != 2) return "Number of implemented interfaces should be 2";

		bool valid;
		bytes32 errorMsg;

		// test activity creation

		// Invalid participant
		error = pd.createActivityDefinition("activity999", BpmModel.ActivityType.TASK, BpmModel.TaskType.USER, BpmModel.TaskBehavior.SENDRECEIVE, "fakeParticipantXYZ", false, EMPTY, EMPTY, EMPTY);
		if (error != BaseErrors.RESOURCE_NOT_FOUND()) return "Creating activity with unknown participant should fail";

		error = pm.addParticipant(participantId1, assignee1, EMPTY, EMPTY, 0x0);
		if (error != BaseErrors.NO_ERROR()) return "Unable to add a valid participant";

		error = pd.createActivityDefinition("activity999", BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, participantId1, false, EMPTY, EMPTY, EMPTY);
		if (error != BaseErrors.INVALID_PARAM_VALUE()) return "Expected INVALID_PARAM_VALUE for non-USER activity with specified assignee";
		error = pd.createActivityDefinition("activity999", BpmModel.ActivityType.TASK, BpmModel.TaskType.USER, BpmModel.TaskBehavior.SENDRECEIVE, EMPTY, false, EMPTY, EMPTY, EMPTY);
		if (error != BaseErrors.NULL_PARAM_NOT_ALLOWED()) return "Expected NULL_PARAM_NOT_ALLOWED for TaskType.USER activity without an assignee";

		// Activity 1
		error = pd.createActivityDefinition(activity1Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.USER, BpmModel.TaskBehavior.SENDRECEIVE, participantId1, true, "app1", EMPTY, EMPTY);
		if (error != BaseErrors.NO_ERROR()) return "Creating activity1 failed";

		(valid, errorMsg) = pd.validate();
		if (!valid) return "The process definition has a single user task and should be valid";
		if (pd.getStartActivity() != activity1Id) return "Start activity should be activity1 after first validation";
		error = pd.createActivityDefinition(activity1Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.USER, BpmModel.TaskBehavior.SENDRECEIVE, participantId1, false, "app1", EMPTY, EMPTY);
		if (error != BaseErrors.RESOURCE_ALREADY_EXISTS()) return "Expected RESOURCE_ALREADY_EXISTS for duplicate activity1 creation";

		// Activity 2
		error = pd.createActivityDefinition(activity2Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, "app1", EMPTY, EMPTY);
		if (error != BaseErrors.NO_ERROR()) return "Creating activity2 failed";
		if (pd.getNumberOfActivities() != 2) return "The process should have two activity definitions at this point";

		(valid, errorMsg) = pd.validate();
		if (valid) return "The process definition has duplicate start activities and should not be valid";
		
		// Scenario 1: Sequential Process
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransition, "blablaActivity", activity2Id)))
			return "Expected REVERT when creating transition for non-existent source element";
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransition, activity1Id, "blablaActivity")))
			return "Expected REVERT when creating transition for non-existent target element";

		error = pd.createTransition(activity1Id, activity2Id);
		if (error != BaseErrors.NO_ERROR()) return "Creating transition activity1 -> activity2 failed";

		(valid, errorMsg) = pd.validate();
		if (!valid) return errorMsg.toString(); // should be valid at this point
		if (pd.getStartActivity() != activity1Id) return "Start activity should still be activity1";

		// Scenario 2: XOR Split
		// create gateway to allow valid setup
		pd.createGateway(gateway1Id, BpmModel.GatewayType.XOR);
		(valid, errorMsg) = pd.validate();
		if (valid) return "The process definition has an unreachable gateway and should not be valid";

		// Activity 3
		error = pd.createActivityDefinition(activity3Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, EMPTY, EMPTY, EMPTY);
		if (error != BaseErrors.NO_ERROR()) return "Creating activity3 failed";
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransition, activity1Id, activity3Id)))
			return "Expected REVERT when attempting to overwrite existing outgoing transition on activity1";

		// Intermediate Event 1
		if (!address(pd).call(abi.encodeWithSignature(functionSigCreateIntermediateEvent, intermediateEvent1Id, uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.IntermediateEventBehavior.CATCHING), bytes32("targetDate"), bytes32("agreement"), address(0), uint256(0))))
			return "Valid call to create intermediate event 1 should succeed";
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateIntermediateEvent, intermediateEvent1Id, uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.IntermediateEventBehavior.CATCHING), bytes32("targetDate"), bytes32("agreement"), address(0), uint256(0))))
			return "Creating an intermediate event with the same ID should REVERT";

		// Boundary Event 1
		if (!address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEvent, activity2Id, boundaryEvent1Id, uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.BoundaryEventBehavior.NON_INTERRUPTING), bytes32(""), bytes32(""), address(0), uint256(2323232678))))
			return "Valid call to create boundary event 1 should succeed";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEvent, bytes32("fakeActivity"), bytes32("newBoundary2"), uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.BoundaryEventBehavior.NON_INTERRUPTING), bytes32("targetDate"), bytes32("agreement"), address(0), uint256(0))))
			return "Adding a boundary event to non-existent activity should REVERT";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEvent, gateway1Id, bytes32("newBoundary3"), uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.BoundaryEventBehavior.NON_INTERRUPTING), bytes32("targetDate"), bytes32("agreement"), address(0), uint256(0))))
			return "Adding a boundary event to a gateway should REVERT";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEvent, activity2Id, boundaryEvent1Id, uint8(BpmModel.EventType.TIMER_TIMESTAMP), uint8(BpmModel.BoundaryEventBehavior.NON_INTERRUPTING), bytes32("targetDate"), bytes32("agreement"), address(0), uint256(0))))
			return "Creating a boundary event with the same ID should REVERT";
		if (!address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEventAction, boundaryEvent1Id, bytes32("agreement"), bytes32(""), address(0), address(0), functionSigCancel)))
			return "Creating a valid boundary event action on event1 should succeed";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEventAction, bytes32("hubbabubba"), bytes32("agreement"), bytes32(""), address(0), address(0), functionSigCancel)))
			return "Creating a boundary event action on a non-existant event ID should REVERT";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEventAction, boundaryEvent1Id, bytes32(""), bytes32(""), address(0), address(0), functionSigCancel)))
			return "Creating an invalid boundary event action not leading to a target should REVERT";
		if (address(pd).call(abi.encodeWithSignature(functionSigAddBoundaryEventAction, boundaryEvent1Id, bytes32("agreement"), bytes32(""), address(0), address(0), EMPTY_STRING)))
			return "Creating a boundary event action with an empty action function should REVERT";

		( , BpmModel.EventType eventType, BpmModel.BoundaryEventBehavior eventBehavior, bytes32 successor) = pd.getBoundaryEventGraphDetails(boundaryEvent1Id);
		if (eventType != BpmModel.EventType.TIMER_TIMESTAMP) return "Retrieval of boundary event did not match event type";
		if (eventBehavior != BpmModel.BoundaryEventBehavior.NON_INTERRUPTING) return "Retrieval of boundary event did not match event behavior";
		if (successor != EMPTY) return "Retrieval of boundary event did not match successor";

		// Activity 4
		error = pd.createActivityDefinition(activity4Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, EMPTY, EMPTY, EMPTY);
		if (error != BaseErrors.NO_ERROR()) return "Creating activity4 failed";

		// check transition condition failure
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransitionConditionForAddress, bytes32("fakeXX"), activity3Id, EMPTY, EMPTY, 0x0, 0, 0x0)))
			return "Adding condition for non-existent gateway should fail";
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransitionConditionForAddress, gateway1Id, bytes32("fakeXX"), EMPTY, EMPTY, 0x0, 0, 0x0)))
			return "Adding condition for non-existent activity should fail";
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransitionConditionForAddress, gateway1Id, activity3Id, EMPTY, EMPTY, 0x0, 0, 0x0)))
			return "Adding condition for non-existent transition connection should fail";

		// establish all missing connections
		pd.createGateway(gateway2Id, BpmModel.GatewayType.XOR);
		pd.createTransition(activity2Id, gateway1Id);
		pd.createTransition(gateway1Id, gateway2Id);
		pd.createTransition(gateway1Id, activity3Id);
		pd.createTransition(gateway2Id, intermediateEvent1Id);
		pd.createTransition(intermediateEvent1Id, activity4Id);

		(valid, errorMsg) = pd.validate();
		if (!valid) return errorMsg.toString(); // process definition should be valid at this point as transition conditions are not part of the validation

		// test transition condition failure when adding condition on default transition
		pd.setDefaultTransition(gateway1Id, gateway2Id);
		if (address(pd).call(abi.encodeWithSignature(functionSigCreateTransitionConditionForAddress, gateway1Id, gateway2Id, EMPTY, EMPTY, 0x0, 0, 0x0)))
			return "Adding condition for the default transition shoudl fail";

		// test transition condition success
		if (!address(pd).call(abi.encodeWithSignature(functionSigCreateTransitionConditionForAddress, gateway1Id, activity3Id, EMPTY, EMPTY, 0x0, 0, 0x0)))
			return "Adding condition on valid transition should succeed";

		//TODO missing test if condition gets deleted when setting activity3 as the default transition

		// check transitions on gateways
		bytes32[] memory inputs;
		bytes32[] memory outputs;
		bytes32 defaultOutput;
		(inputs, outputs, , defaultOutput) = pd.getGatewayGraphDetails(gateway1Id);
		if (inputs.length != 1) return "XOR SPLIT gateway should have 1 incoming transitions";
		if (outputs.length != 2) return "XOR SPLIT gateway should have 2 outgoing transitions";
		if (defaultOutput != "gateway2") return "XOR SPLIT should have gateway2 set as default transition";

		bytes32[] memory activityIds = pd.getActivitiesForParticipant(participantId1);
		if (activityIds.length != 1)
			return "There should be 1 activity using participant1 as assignee";
		if (pd.getActivitiesForParticipant(participantId1)[0] != activity1Id)
			return "getActivitiesForParticipant should return activity1 for participant1";

		return SUCCESS;
	}

	/**
	 * @dev Tests the setup and resolution of transition conditions via the ProcessDefinition
	 */
	function testTransitionConditionResolution() external returns (string) {

		ProcessModel pm = new DefaultProcessModel();
		pm.initialize("conditionsModel", [1,0,0], author, false, dummyModelFileReference);
		ProcessDefinition pd = new DefaultProcessDefinition();
		pd.initialize("p1", address(pm));

		pd.createActivityDefinition(activity1Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, EMPTY, EMPTY, EMPTY);
		pd.createActivityDefinition(activity2Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, EMPTY, EMPTY, EMPTY);
		pd.createActivityDefinition(activity3Id, BpmModel.ActivityType.TASK, BpmModel.TaskType.NONE, BpmModel.TaskBehavior.SEND, EMPTY, false, EMPTY, EMPTY, EMPTY);
		pd.createGateway(transition1Id, BpmModel.GatewayType.XOR);
		pd.createTransition(activity1Id, transition1Id);
		pd.createTransition(transition1Id, activity2Id);
		pd.createTransition(transition1Id, activity3Id);

		pd.createTransitionConditionForAddress(transition1Id, activity2Id, "buyer", EMPTY, 0x0, uint8(DataStorageUtils.COMPARISON_OPERATOR.EQ), this);
		pd.createTransitionConditionForUint(transition1Id, activity3Id, "elevation", EMPTY, 0x0, uint8(DataStorageUtils.COMPARISON_OPERATOR.LTE), 500);

		// this is the DataStorage used for resolving conditions
		TestData dataStorage = new TestData();
		
		if (pd.resolveTransitionCondition(transition1Id, activity2Id, dataStorage)) return "The condition for transition1/activity2 should be false as the data is not set";
		dataStorage.setDataValueAsAddress("buyer", this);
		if (!pd.resolveTransitionCondition(transition1Id, activity2Id, dataStorage)) return "The condition for transition1/activity2 should be true after data is set";
		dataStorage.setDataValueAsUint("elevation", 2200);
		if (pd.resolveTransitionCondition(transition1Id, activity3Id, dataStorage)) return "The condition for transition1/activity3 should be false";

		return SUCCESS;
	}

}

contract TestApplication {
	
	bool public success;
	
	function doSomething() external {
		success = true;
	}
}

/**
 * Helper contract to provide a DataStorage location
 */
contract TestData is AbstractDataStorage {}
