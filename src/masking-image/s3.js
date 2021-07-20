'use strict';
const AWS = require('aws-sdk');
module.exports = {
    list: async ({ bucketName, prefix }, contentsFilter = null, contentsMapper = null) => {
        const s3 = new AWS.S3();
        let param = { Bucket: bucketName, Prefix: prefix },
            items = [];
        while (true) {
            let s = await s3.listObjectsV2(param).promise(),
                contents = contentsFilter ?
                    s.Contents.filter(item => contentsFilter(item)) :
                    s.Contents;
            items = items.concat(
                contentsMapper ?
                    contents.map(item => contentsMapper(item)) :
                    contents
            );
            if (s.IsTruncated && s.NextContinuationToken) {
                param.ContinuationToken = s.NextContinuationToken;
            } else {
                break;
            }
        }
        return items;
    },
    delete: async ({ bucketName, fileName }) => {
        const s3 = new AWS.S3();
        return await s3.deleteObject({
            Bucket: bucketName,
            Key: fileName
        }).promise();
    },
    write: async ({ bucketName, fileName, body, encoding = "utf8" }) => {
        const s3 = new AWS.S3();
        await s3.putObject({
            Bucket: bucketName,
            Key: fileName,
            Body: Buffer.from(body, encoding)
        }).promise();
        return {
            bucketName: bucketName,
            fileName: fileName
        };
    },
    read: async ({ bucketName, fileName }) => {
        const s3 = new AWS.S3(),
            data = await s3.getObject({
                Bucket: bucketName,
                Key: fileName
            }).promise();
        return data.Body;
    },
    copy: async ({ sourceBucketName, sourceFileName }, { targetBucketName, targetFileName }) => {
        const s3 = new AWS.S3();
        return await s3.copyObject({
            Bucket: targetBucketName,
            Key: targetFileName,
            CopySource: `/${sourceBucketName}/${sourceFileName}`
        }).promise();
    }
};
