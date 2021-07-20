'use strict';
const AWS = require("aws-sdk");
const s3 = require("awshelper/s3");

const sleep = async (waitTimeInMs) => {
    return new Promise(resolve => setTimeout(resolve, waitTimeInMs));
};

module.exports = {
    needed: async (event, context) => {
        console.log(event);
        const objectRules = JSON.parse(process.env.OBJECTRULES),
            defaultRules = JSON.parse(process.env.DEFAULTRULES),
            maskingRules = objectRules[event.setting.toLowerCase()][event.folder.toLowerCase()],
            needed = maskingRules ? true : false,
            output = {
                ...event,
                needed: needed
            };
        if (needed) {
            output.rules = JSON.stringify(
                Object.keys(maskingRules).reduce(
                    (rules, key) => {
                        let k = Object.keys(maskingRules[key])[0];
                        rules[key][k] = {
                            ...defaultRules[k],
                            ...maskingRules[key][k]
                        };
                        return rules;
                    }, maskingRules
                )
            );
        }
        console.log(JSON.stringify(output));
        return output;
    },

    invoke: async (event, context) => {
        const stepFunctions = new AWS.StepFunctions({ region: process.env.REGION });
        let taskToken = null;
        for (; !taskToken;) {
            const got = await stepFunctions.getActivityTask({
                activityArn: process.env.ACTIVITY,
                workerName: `${event.fileName.replace("/", "_").replace(".", "_")}_${Date.now()}`
            }).promise();
            if (got.taskToken) {
                taskToken = got.taskToken;
                break;
            } else {
                await sleep(2000);
            }
        }
        console.log(taskToken);
        return { ...event, token: taskToken };
    },

    move: async (event, context) => {
        console.log(event);
        const output = (false === event.needed ? event : event[0]),
            s3Service = s3({ region: process.env.REGION, roleArn: null });
        output.copied = await s3Service.copy({
            sourceBucketName: output.bucketName,
            sourceFileName: output.fileName
        }, {
            targetBucketName: process.env.LOADERBUCKET,
            targetFileName: output.fileName
        });
        console.log(output);
        return output;
    }
};
