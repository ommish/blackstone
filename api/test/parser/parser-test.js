const path = require("path");
const fs = require("fs");
const chai = require("chai");
const should = chai.should();
const expect = chai.expect;
const assert = chai.assert;

global.__config = path.resolve('config');
global.__common = path.resolve('common');
global.__constants = require(path.join(__common, 'constants'));

const bpmnParser = require(path.resolve("lib", "bpmn-parser"));

const xmlString = fs.readFileSync(path.resolve("data", "sample", "T2-example.bpmn"), "utf8");
const gatewayXml = fs.readFileSync(path.resolve("test", "data", "Gateways-Parser-Test.bpmn"), "utf8");
const timerXml = fs.readFileSync(path.resolve("test", "data", "timer-model.bpmn"), "utf8");

describe("BPMN XML Parser", () => {
  let parser;

  it("should parse stringified booleans", () => {
    expect(bpmnParser.getBooleanFromString("true")).to.be.true;
    expect(bpmnParser.getBooleanFromString("True")).to.be.false;
    expect(bpmnParser.getBooleanFromString("false")).to.be.false;
    expect(bpmnParser.getBooleanFromString("False")).to.be.false;
    expect(bpmnParser.getBooleanFromString(true)).to.be.true;
    expect(bpmnParser.getBooleanFromString(false)).to.be.false;
    expect(bpmnParser.getBooleanFromString(1)).to.be.false;
    expect(bpmnParser.getBooleanFromString(-100)).to.be.false;
    expect(bpmnParser.getBooleanFromString(0)).to.be.false;
    expect(bpmnParser.getBooleanFromString("abc")).to.be.false;
    expect(bpmnParser.getBooleanFromString({
      a: 1
    })).to.be.false;
    expect(bpmnParser.getBooleanFromString()).to.be.false;
  });

  it("should get model details", async () => {
    parser = bpmnParser.getNewParser();
    expect(parser).to.exist;
    await parser.parse(xmlString);
    let model = parser.getModel();
    expect(model).to.deep.equal(expectedModel);
  });

  it("should get processes", async () => {
    let processes = parser.getProcesses();
    let p1 = processes.filter((p) => {
      return p.id === expectedProcess1.id;
    })[0];
    let p2 = processes.filter((p) => {
      return p.id === expectedProcess2.id;
    })[0];
    expect(p1).to.deep.equal(expectedProcess1);
    expect(p2).to.deep.equal(expectedProcess2);
  });

  it('Should get gateway details', async () => {
    try {
      parser = bpmnParser.getNewParser();
      await parser.parse(gatewayXml);
      let model = parser.getModel();
      let processes = parser.getProcesses();
      let p1 = processes.filter((p) => {
        return p.id === gatewayProcess1.id;
      })[0];
      expect(model).to.deep.equal(gatewayModel1);
      expect(p1).to.deep.equal(gatewayProcess1);
    } catch (err) {
      throw err;
    }
  });

  it('Should get boundary and intermediate timer details', async () => {
    try {
      parser = bpmnParser.getNewParser();
      await parser.parse(timerXml);
      let model = parser.getModel();
      let processes = parser.getProcesses();
      let p1 = processes.filter((p) => {
        return p.id === timerProcess1.id;
      })[0];
      expect(model).to.deep.equal(timerModel1);
      expect(p1).to.deep.equal(timerProcess1);
    } catch (err) {
      throw err;
    }
  });
});

const expectedModel = {
  id: "model_1",
  name: "Model_1",
  version: [1, 0, 0],
  private: true,
  dataStoreFields: [{
      dataStorageId: 'PROCESS_INSTANCE',
      dataPath: 'agreement',
      parameterType: 7,
    },
    {
      dataStorageId: 'agreement',
      dataPath: 'Assignee',
      parameterType: 8,
    },
  ],
};

const expectedProcess1 = {
  "id": "formationProcess1",
  "name": "Formation Process 1",
  "interface": "FormationProcess",
  "participants": [{
    "id": "lane1",
    "name": "Signatories",
    "tasks": ["reviewTask1", "Task_03gfu05", "signTask1", "Task_00is0tl"],
    "conditionalPerformer": true,
    "dataPath": "AGREEMENT_PARTIES",
    "dataStorageId": "agreement"
  }, {
    "id": "lane2",
    "name": "Acme Corp",
    "tasks": ["approveTask1", "Task_0667wyu"],
    "account": "0x1040e6521541daB4E7ee57F21226dD17Ce9F0Fb7"
  }],
  "tasks": [{
    "id": "Task_03gfu05",
    "name": "Dummy Task",
    "assignee": "",
    "activityType": 0,
    "taskType": 0,
    "behavior": 0,
    "multiInstance": false,
    "application": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }],
  "userTasks": [{
    "id": "reviewTask1",
    "name": "Review Agreement",
    "assignee": "lane1",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "dataMappings": [{
      "id": "agreement",
      "direction": 0,
      "dataPath": "agreement",
      "dataStorageId": ""
    }],
    "application": "AgreementSignatureCheck",
    "completionFunction": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }, {
    "id": "signTask1",
    "name": "Sign Agreement",
    "assignee": "lane1",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "application": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }, {
    "id": "Task_0667wyu",
    "name": "Validate Signature",
    "assignee": "lane2",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "dataMappings": [{
      "id": "Signed",
      "direction": 1,
      "dataPath": "Signed",
      "dataStorageId": "agreement"
    }, {
      "id": "Notified",
      "direction": 0,
      "dataPath": "Notified",
      "dataStorageId": "agreement"
    }, {
      "id": "Sealed",
      "direction": 1,
      "dataPath": "Sealed",
      "dataStorageId": "agreement"
    }],
    "application": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }],
  "sendTasks": [{
    "id": "Task_00is0tl",
    "name": "Send Notification",
    "activityType": 0,
    "taskType": 3,
    "application": "",
    "behavior": 1,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "assignee": "",
    "multiInstance": false
  }],
  "serviceTasks": [{
    "id": "Task_13ndog8",
    "name": "Emit Sign Event",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "application": "ActivityEventEmitter",
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "dataMappings": [{
      "id": "Notified",
      "direction": 1,
      "dataPath": "Notified",
      "dataStorageId": "agreement"
    }]
  }],
  "subProcesses": [{
    "id": "approveTask1",
    "name": "Approve Formation",
    "assignee": "",
    "activityType": 1,
    "taskType": 0,
    "behavior": 0,
    "multiInstance": false,
    "application": "",
    "subProcessModelId": "model_1",
    "subProcessDefinitionId": "executionProcess1"
  }],
  "transitions": [{
    "id": "SequenceFlow_0f0mciq",
    "source": "Task_00is0tl",
    "target": "Task_13ndog8"
  }, {
    "id": "SequenceFlow_11wkg2g",
    "source": "reviewTask1",
    "target": "Task_03gfu05"
  }, {
    "id": "SequenceFlow_0g7y82m",
    "source": "Task_03gfu05",
    "target": "signTask1"
  }, {
    "id": "SequenceFlow_1inl1i9",
    "source": "signTask1",
    "target": "Task_00is0tl"
  }, {
    "id": "SequenceFlow_032hols",
    "source": "Task_13ndog8",
    "target": "Task_0667wyu"
  }, {
    "id": "SequenceFlow_0j7lsvv",
    "source": "Task_0667wyu",
    "target": "approveTask1"
  }],
  "activityMap": {
    "reviewTask1": "Review Agreement",
    "Task_03gfu05": "Dummy Task",
    "signTask1": "Sign Agreement",
    "Task_00is0tl": "Send Notification",
    "Task_13ndog8": "Emit Sign Event",
    "Task_0667wyu": "Validate Signature"
  },
  "andGateways": [],
  "xorGateways": [],
  "boundaryEvents": [],
  "intermediateCatchEvents": [],
};

const expectedProcess2 = {
  "id": "executionProcess1",
  "name": "Execution Process 1",
  "interface": "ExecutionProcess",
  "participants": [{
    "id": "lane3",
    "name": "WalCorp",
    "tasks": ["disburse1", "reviewTask2", "Task_1b37sj9"],
    "account": "0x1040e6521541daB4E7ee57F21226dD17Ce9F0Ef7"
  }],
  "tasks": [],
  "userTasks": [{
    "id": "disburse1",
    "name": "Disburse Payments",
    "assignee": "lane3",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "application": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }, {
    "id": "reviewTask2",
    "name": "Review Completion",
    "assignee": "lane3",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "application": "",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }],
  "sendTasks": [],
  "serviceTasks": [],
  "subProcesses": [],
  "transitions": [{
    "id": "SequenceFlow_14t5289",
    "source": "reviewTask2",
    "target": "Task_1b37sj9"
  }, {
    "id": "SequenceFlow_1nxuq77",
    "source": "Task_1b37sj9",
    "target": "disburse1"
  }],
  "activityMap": {
    "disburse1": "Disburse Payments",
    "reviewTask2": "Review Completion",
  },
  "andGateways": [],
  "xorGateways": [],
  "boundaryEvents": [],
  "intermediateCatchEvents": [],
};

const gatewayModel1 = {
  "dataStoreFields": [{
    "dataStorageId": "PROCESS_INSTANCE",
    "dataPath": "agreement",
    "parameterType": 7
  }, {
    "dataStorageId": "agreement",
    "dataPath": "Age",
    "parameterType": 2
  }, {
    "dataStorageId": "agreement",
    "dataPath": "ContentId",
    "parameterType": 1
  }],
  "name": "Collaboration_1bqszqk",
  "id": "vg_age_ver123",
  "version": [1, 0, 0],
  "private": false
};

const gatewayProcess1 = {
  "id": "Process_AgeVer",
  "name": "Video Game Age Verification",
  "interface": "Agreement Formation",
  "participants": [{
    "id": "Lane_14s4k1q",
    "name": "Gamer",
    "tasks": ["Task_0ykqbq7"],
    "conditionalPerformer": true,
    "dataStorageId": "agreement",
    "dataPath": "Gamer"
  }],
  "tasks": [],
  "userTasks": [{
    "id": "Task_0ykqbq7",
    "name": "Enter Age",
    "assignee": "Lane_14s4k1q",
    "activityType": 0,
    "taskType": 1,
    "behavior": 1,
    "multiInstance": false,
    "dataMappings": [{
      "id": "Age",
      "direction": 1,
      "dataPath": "Age",
      "dataStorageId": "agreement"
    }],
    "application": "WebAppApprovalForm",
    "subProcessModelId": "",
    "subProcessDefinitionId": ""
  }],
  "sendTasks": [],
  "transitions": [{
    "id": "SequenceFlow_0i0kus1",
    "source": "Task_0ykqbq7",
    "target": "ExclusiveGateway_0gx4teu"
  }, {
    "id": "SequenceFlow_1f964ot",
    "source": "ExclusiveGateway_0gx4teu",
    "target": "Task_0y0e72x",
    "condition": {
      "lhDataStorageId": "agreement",
      "lhDataPath": "Age",
      "operator": 4,
      "rhValue": "18",
      "dataType": 18
    }
  }, {
    "id": "SequenceFlow_1jj19x9",
    "source": "ExclusiveGateway_0gx4teu",
    "target": "Task_0676pdy"
  }, {
    "id": "SequenceFlow_0rfe1i3",
    "source": "Task_0y0e72x",
    "target": "ExclusiveGateway_0901bl7"
  }, {
    "id": "SequenceFlow_1agn7w1",
    "source": "Task_0676pdy",
    "target": "ExclusiveGateway_0901bl7"
  }, {
    "id": "SequenceFlow_09zher9",
    "source": "ExclusiveGateway_0901bl7",
    "target": "Task_1x5ar30"
  }, {
    "id": "SequenceFlow_0q8umgj",
    "source": "Task_1x5ar30",
    "target": "ExclusiveGateway_0mqmev4"
  }, {
    "id": "SequenceFlow_0sqk84k",
    "source": "ExclusiveGateway_0mqmev4",
    "target": "Task_1wmfg58"
  }, {
    "id": "SequenceFlow_0ijntc6",
    "source": "ExclusiveGateway_0mqmev4",
    "target": "Task_09kuq9m"
  }, {
    "id": "SequenceFlow_0lvec4s",
    "source": "Task_1wmfg58",
    "target": "ExclusiveGateway_11bw6vr"
  }, {
    "id": "SequenceFlow_04yguww",
    "source": "Task_09kuq9m",
    "target": "ExclusiveGateway_11bw6vr"
  }, {
    "id": "SequenceFlow_021mzyg",
    "source": "ExclusiveGateway_11bw6vr",
    "target": "Task_0dy81yu"
  }],
  "subProcesses": [],
  "serviceTasks": [{
    "id": "Task_0y0e72x",
    "name": "Show Trailer",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "dataMappings": [{
      "id": "ContentId",
      "direction": 1,
      "dataPath": "ContentId",
      "dataStorageId": ""
    }],
    "application": "ShowContentApp"
  }, {
    "id": "Task_0676pdy",
    "name": "Display Message",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "dataMappings": [{
      "id": "MessageId",
      "direction": 1,
      "dataPath": "MessageId",
      "dataStorageId": ""
    }],
    "application": "ShowMessageApp"
  }, {
    "id": "Task_1x5ar30",
    "name": "Navigate To Home",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "application": "RouterApp"
  }, {
    "id": "Task_1wmfg58",
    "name": "Show Feedback Form",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "application": "FeedbackFormApp"
  }, {
    "id": "Task_09kuq9m",
    "name": "Update View Stats",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "application": "UpdateStatsApp"
  }, {
    "id": "Task_0dy81yu",
    "name": "Save Feedback",
    "assignee": "",
    "activityType": 0,
    "taskType": 2,
    "behavior": 0,
    "multiInstance": false,
    "subProcessModelId": "",
    "subProcessDefinitionId": "",
    "application": "FeedbackApp"
  }],
  "xorGateways": [{
    "id": "ExclusiveGateway_0gx4teu",
    "type": 0,
    "incoming": ["SequenceFlow_0i0kus1"],
    "outgoing": ["SequenceFlow_1f964ot", "SequenceFlow_1jj19x9"]
  }, {
    "id": "ExclusiveGateway_0901bl7",
    "type": 0,
    "incoming": ["SequenceFlow_0rfe1i3", "SequenceFlow_1agn7w1"],
    "outgoing": ["SequenceFlow_09zher9"]
  }],
  "andGateways": [{
    "id": "ExclusiveGateway_0mqmev4",
    "type": 2,
    "incoming": ["SequenceFlow_0q8umgj"],
    "outgoing": ["SequenceFlow_0sqk84k", "SequenceFlow_0ijntc6"]
  }, {
    "id": "ExclusiveGateway_11bw6vr",
    "type": 2,
    "incoming": ["SequenceFlow_0lvec4s", "SequenceFlow_04yguww"],
    "outgoing": ["SequenceFlow_021mzyg"]
  }],
  "activityMap": {
    "Task_0ykqbq7": "Enter Age",
    "Task_0y0e72x": "Show Trailer",
    "Task_0676pdy": "Display Message",
    "Task_1x5ar30": "Navigate To Home",
    "Task_1wmfg58": "Show Feedback Form",
    "Task_09kuq9m": "Update View Stats",
    "Task_0dy81yu": "Save Feedback"
  },
  "defaultTransitions": [{
    "gateway": "ExclusiveGateway_0gx4teu",
    "transition": "SequenceFlow_1jj19x9",
    "activity": "Task_0676pdy"
  }],
  "boundaryEvents": [],
  "intermediateCatchEvents": [],
};

const timerModel1 = {
  "dataStoreFields": [
    { "dataStorageId": "PROCESS_INSTANCE", "dataPath": "agreement", "parameterType": 7 },
    { "dataStorageId": "PROCESS_INSTANCE", "dataPath": "SignBy", "parameterType": 4 },
    { "dataStorageId": "PROCESS_INSTANCE", "dataPath": "WaitFor", "parameterType": 4 },
    { "dataStorageId": "agreement", "dataPath": "Assignee", "parameterType": 8 }
  ],
  "name": "Collaboration_1bqszqk",
  "id": "timer-model",
  "version": [1, 0, 0],
  "private": true
};

const timerProcess1 = {
  "id": "Process_104nkeu",
  "name": "Process Name",
  "interface": "Agreement Formation",
  "participants": [
    {
      "id": "Lane_1qvrgtf",
      "name": "Assignee",
      "tasks": ["Task_1jrtitw"],
      "conditionalPerformer": true,
      "dataStorageId": "agreement",
      "dataPath": "Assignee"
    },
    {
      "id": "Lane_18i4kvj",
      "name": "Agreement Parties (Signatories)",
      "tasks": ["Task_0ky8n9d", "BoundaryEvent_0ysx6f3", "IntermediateThrowEvent_18c1gi7"],
      "conditionalPerformer": true,
      "dataStorageId": "agreement",
      "dataPath": "AGREEMENT_PARTIES"
    }
  ],
  "tasks": [],
  "userTasks": [
    {
      "id": "Task_1jrtitw",
      "name": "User Task",
      "assignee": "Lane_1qvrgtf",
      "activityType": 0,
      "taskType": 1,
      "behavior": 1,
      "multiInstance": false,
      "dataMappings": [{ "id": "Signby", "direction": 0, "dataPath": "SignBy", "dataStorageId": "" }],
      "application": "",
      "subProcessModelId": "",
      "subProcessDefinitionId": ""
    },
    {
      "id": "Task_0ky8n9d",
      "name": "Signing Task",
      "assignee": "Lane_18i4kvj",
      "activityType": 0,
      "taskType": 1,
      "behavior": 1,
      "multiInstance": true,
      "dataMappings": [{ "id": "agreement", "direction": 0, "dataPath": "agreement", "dataStorageId": "" }],
      "application": "AgreementSignatureCheck",
      "subProcessModelId": "",
      "subProcessDefinitionId": ""
    }
  ],
  "sendTasks": [],
  "transitions": [
    { "id": "SequenceFlow_0twrlls", "source": "IntermediateThrowEvent_18c1gi7", "target": "Task_1jrtitw" },
    { "id": "SequenceFlow_0zwb2ij", "source": "Task_0ky8n9d", "target": "IntermediateThrowEvent_18c1gi7" }
  ],
  "subProcesses": [],
  "serviceTasks": [],
  "xorGateways": [],
  "andGateways": [],
  "activityMap": { "Task_1jrtitw": "User Task", "Task_0ky8n9d": "Signing Task" },
  "boundaryEvents": [
    {
      "name": "SignBy",
      "id": "BoundaryEvent_0ysx6f3",
      "type": "date",
      "attachedTo": "Task_0ky8n9d",
      "dataMappings": [{ "id": "SignBy", "direction": 0, "dataPath": "SignBy", "dataStorageId": "" }],
      "ESCALATION_ACTION": "CANCEL_AGREEMENT"
    }
  ],
  "intermediateCatchEvents": [
    {
      "name": "Wait For",
      "id": "IntermediateThrowEvent_18c1gi7",
      "type": "date",
      "activityType": 0,
      "taskType": 0,
      "behavior": 1,
      "dataMappings": [{ "id": "WaitFor", "direction": 0, "dataPath": "WaitFor", "dataStorageId": "" }]
    }
  ]
};
