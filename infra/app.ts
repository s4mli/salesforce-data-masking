import * as cdk from '@aws-cdk/core';
import * as config from '../config.json';
import * as dataMaskingService from "./data-masking-service";

class dataMaskingServiceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: dataMaskingService.dataMaskingServiceStackProps) {
    super(scope, id, props);
    new dataMaskingService.dataMaskingService(this, id, props);
  }
};


const app = new cdk.App();
let stackQa = new dataMaskingServiceStack(app, config.qa.id, {
  awsEnv: "qa",
  vpcId: config.qa.vpcId,
  tags: config.tags,
  env: {
    account: config.qa.account,
    region: config.region
  },
  bucketName: config.bucketName,
  archiveBucketName: config.archiveBucketName,
  layerName: config.qa.layer.name,
  layerVersion: config.qa.layer.version,
  loaderBucketName: config.qa.loaderBucketName,
  defaultRules: config.defaultMaskingRules,
  objectRulesOverride: config.objectMaskingRulesOverride
});
let stackStaging = new dataMaskingServiceStack(app, config.staging.id, {
  awsEnv: "staging",
  vpcId: config.staging.vpcId,
  tags: config.tags,
  env: {
    account: config.staging.account,
    region: config.region
  },
  bucketName: config.bucketName,
  archiveBucketName: config.archiveBucketName,
  layerName: config.staging.layer.name,
  layerVersion: config.staging.layer.version,
  loaderBucketName: config.staging.loaderBucketName,
  defaultRules: config.defaultMaskingRules,
  objectRulesOverride: config.objectMaskingRulesOverride
});
let stackProd = new dataMaskingServiceStack(app, config.prod.id, {
  awsEnv: "prod",
  vpcId: config.prod.vpcId,
  tags: config.tags,
  env: {
    account: config.prod.account,
    region: config.region
  },
  bucketName: config.bucketName,
  archiveBucketName: config.archiveBucketName,
  layerName: config.prod.layer.name,
  layerVersion: config.prod.layer.version,
  loaderBucketName: config.prod.loaderBucketName,
  defaultRules: config.defaultMaskingRules,
  objectRulesOverride: config.objectMaskingRulesOverride
});

