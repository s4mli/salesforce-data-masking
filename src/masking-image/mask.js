'use strict';
const s3Service = require("./s3");
const AWS = require("aws-sdk");
const csv2Json = require("csvtojson");
const json2Csv = require("json2csv");
const dataMasking = require("./rule");

const maskField = (item, field, rules) => {
    if (item[field] && rules[field]) {
        const ruleName = Object.keys(rules[field])[0];
        item[field] = dataMasking[ruleName](item[field], rules[field][ruleName]);
    }
    return item[field];
};

const doMasking = async () => {
    const rules = JSON.parse(process.env.rules),
        fields = Object.keys(rules),
        fileName = process.env.fileName,
        bucketName = process.env.bucketName,
        archiveBucketName = process.env.archiveBucketName,
        dataFromS3 = await s3Service.read({ bucketName, fileName }),
        data = await csv2Json().fromString(dataFromS3.toString()),
        total = data.length;
    console.log("total: ", total);
    const maskedData = data.map(item => {
        let keysToRemove = [];
        for (let key of Object.keys(item)) {
            if ("object" === typeof item[key]) {
                for (let ck of Object.keys(item[key])) {
                    const field = `${key}.${ck}`;
                    item[field] = item[key][ck];
                    if (fields.includes(field)) {
                        item[field] = maskField(item, field, rules);
                    }
                }
                keysToRemove.push(key);
            } else {
                if (fields.includes(key)) {
                    item[key] = maskField(item, key, rules);
                }
            }
        }
        for (let k of keysToRemove) {
            delete item[k];
        }
        return item;
    });
    console.log("masked total: ", maskedData.length);
    const s3 = new AWS.S3(),
        maskedFileName = `${fileName.replace(".csv", "_masked.csv")}`,
        output = {
            bucketName: archiveBucketName,
            fileName: maskedFileName,
            done: await s3.putObject({
                Bucket: archiveBucketName,
                Key: maskedFileName,
                Body: await json2Csv.parseAsync(
                    maskedData, {}, { objectMode: true }
                )
            }).promise()
        };
    console.log("masked: ", JSON.stringify(output));
    await s3Service.copy({
        sourceBucketName: bucketName,
        sourceFileName: fileName
    }, {
        targetBucketName: archiveBucketName,
        targetFileName: fileName
    });
    await s3Service.delete({ bucketName, fileName });
    return output;
};

(async () => {
    const token = process.env.token,
        region = process.env.region,
        stepFunctions = new AWS.StepFunctions({ region });
    try {
        await stepFunctions.sendTaskSuccess({
            taskToken: token,
            output: JSON.stringify(await doMasking())
        }).promise();
    } catch (err) {
        console.log(err);
        await stepFunctions.sendTaskFailure({
            taskToken: token,
            error: err.message,
            cause: err.stack ? err.stack : "bug"
        }).promise();
    }
})();
