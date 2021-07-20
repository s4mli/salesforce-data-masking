const aws = require("aws-sdk");
const stepFunctions = new aws.StepFunctions();

exports.handler = async (event, context) => {
  console.log(JSON.stringify(event));
  const bucketName = event.Records[0].s3.bucket.name,
    fileName = event.Records[0].s3.object.key;
  const fileNameArr = fileName.split("/");
  let setting = "", folder = "";
  if (fileNameArr.length > 2) {
    setting = fileNameArr[0];
    folder = fileNameArr[1];
  } else {
    setting = "candidate";
    folder = fileNameArr[0];
  }
  const file = (fileNameArr[fileNameArr.length - 1].split(".")[0]).substr(0, 20),
    stateMachineParams = {
      stateMachineArn: process.env.STATENACHINE,
      input: JSON.stringify({ bucketName, fileName, setting, folder }),
      name: `${setting}_${folder}_${file}_${Date.now()}`
    }, execution = await stepFunctions.startExecution(stateMachineParams).promise();
  event = { ...event, execution };
  console.log(JSON.stringify(event));
  return event;
};
