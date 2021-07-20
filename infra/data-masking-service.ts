import core = require("@aws-cdk/core");
import s3 = require("@aws-cdk/aws-s3");
import iam = require("@aws-cdk/aws-iam");
import ssm = require("@aws-cdk/aws-ssm");
import ec2 = require('@aws-cdk/aws-ec2');
import ecs = require('@aws-cdk/aws-ecs');
import logs = require("@aws-cdk/aws-logs");
import lambda = require("@aws-cdk/aws-lambda");
import sfn = require("@aws-cdk/aws-stepfunctions");
import s3n = require("@aws-cdk/aws-s3-notifications");
import task = require("@aws-cdk/aws-stepfunctions-tasks");
import ecs_patterns = require('@aws-cdk/aws-ecs-patterns');
import elbv2 = require("@aws-cdk/aws-elasticloadbalancingv2");

export interface dataMaskingServiceStackProps extends core.StackProps {
  vpcId?: string;
  awsEnv?: string;
  region?: string;
  bucketName?: string;
  archiveBucketName?: string;
  layerName?: string;
  layerVersion: number;
  loaderBucketName?: string;
  tags?: {
    [key: string]: string;
  };
  defaultRules?: {
    [key: string]: {
      [key: string]: any;
    }
  };
  objectRulesOverride?: {
    [key: string]: {
      [key: string]: {
        [key: string]: {
          [key: string]: {
            [key: string]: any;
          }
        }
      }
    }
  };
};

export class dataMaskingService extends core.Construct {
  constructor(scope: core.Construct, id: string, props: dataMaskingServiceStackProps) {
    super(scope, id);
    const prefix = id + "-",
      bucket = new s3.Bucket(this, prefix + props.bucketName, {
        bucketName: prefix + props.bucketName
      }), archiveBucket = new s3.Bucket(this, prefix + props.archiveBucketName, {
        bucketName: prefix + props.archiveBucketName,
        lifecycleRules: [{ expiration: core.Duration.days(30) }]
      }), loaderBucket = s3.Bucket.fromBucketName(this,
        props.loaderBucketName || "sfdc-data-loader-qa-dropbox",
        props.loaderBucketName || "sfdc-data-loader-qa-dropbox"),
      layerArn = ssm.StringParameter.fromStringParameterAttributes(this,
        prefix + "layer", { parameterName: `/ripley/layer-${props.awsEnv}/latest` }
      ).stringValue;
    const helperLayer = lambda.LayerVersion.fromLayerVersionArn(this, `${props.layerName}`, layerArn),
      activity = new sfn.Activity(this, prefix + "activity", { activityName: prefix + "activity" }),
      lambdaNeeded = new lambda.Function(this, prefix + "needed", {
        functionName: prefix + "needed",
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("resources"),
        handler: "data-masking.needed",
        timeout: core.Duration.minutes(2),
        logRetention: logs.RetentionDays.TWO_WEEKS,
        environment: {
          "OBJECTRULES": JSON.stringify(props.objectRulesOverride) || "",
          "DEFAULTRULES": JSON.stringify(props.defaultRules) || "",
        }
      }), lambdaInvoke = new lambda.Function(this, prefix + "invoke", {
        functionName: prefix + "invoke",
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("resources"),
        handler: "data-masking.invoke",
        timeout: core.Duration.minutes(2),
        logRetention: logs.RetentionDays.TWO_WEEKS,
        environment: {
          "REGION": props.env?.region || "ap-southeast-2",
          "ACTIVITY": activity.activityArn
        }
      }), lambdaMove = new lambda.Function(this, prefix + "move", {
        functionName: prefix + "move",
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("resources"),
        handler: "data-masking.move",
        timeout: core.Duration.minutes(5),
        logRetention: logs.RetentionDays.TWO_WEEKS,
        environment: {
          "REGION": props.env?.region || "ap-southeast-2",
          "LOADERBUCKET": loaderBucket.bucketName,
          "ARCHIVEBUCKET": archiveBucket.bucketName
        }
      });
    const vpc = ec2.Vpc.fromLookup(this, prefix + "vpc", { vpcId: props.vpcId }),
      subnets: ec2.ISubnet[] = [] as ec2.ISubnet[];
    vpc.privateSubnets.forEach(subnet => {
      if (subnets.length == 0) {
        subnets.push(subnet);
      } else if (subnets.length < 2 && subnets.find(v => {
        return v.availabilityZone == subnet.availabilityZone ? false : true;
      })) {
        subnets.push(subnet);
      }
    });
    const moveTask = new task.LambdaInvoke(this, prefix + "move-step", {
      lambdaFunction: lambdaMove,
      payloadResponseOnly: true
    }), taskDefinition = new ecs.FargateTaskDefinition(this, 'TD', {
      cpu: 1024,
      memoryLimitMiB: 4096
    }), containerDefinition = taskDefinition.addContainer(prefix + "masking-in-fargate", {
      image: ecs.ContainerImage.fromAsset(__dirname + "/../resources/masking-image"),
      memoryLimitMiB: 256,
    }), parallel = new sfn.Parallel(this, prefix + "invoke-and-wait").branch(
      new task.StepFunctionsInvokeActivity(this, prefix + "wait-step", {
        activity: activity,
        timeout: core.Duration.hours(1)
      }),
      new task.LambdaInvoke(this, prefix + "invoke-step", {
        lambdaFunction: lambdaInvoke,
        payloadResponseOnly: true
      }).next(
        new task.EcsRunTask(this, prefix + 'masking-step', {
          cluster: new ecs.Cluster(this, prefix + 'fargateCluster', { vpc }),
          taskDefinition: taskDefinition,
          launchTarget: new task.EcsFargateLaunchTarget({
            platformVersion: ecs.FargatePlatformVersion.LATEST
          }),
          assignPublicIp: true,
          containerOverrides: [{
            containerDefinition,
            command: ["node", "mask.js"],
            environment: [
              { name: "token", value: sfn.JsonPath.stringAt("$.token") },
              { name: "rules", value: sfn.JsonPath.stringAt("$.rules") },
              { name: "fileName", value: sfn.JsonPath.stringAt("$.fileName") },
              { name: "archiveBucketName", value: archiveBucket.bucketName },
              { name: "bucketName", value: sfn.JsonPath.stringAt("$.bucketName") },
            ]
          }]
        })
      )
    );
    const dataMaskingSm = new sfn.StateMachine(this, id, {
      stateMachineName: id,
      definition: new task.LambdaInvoke(this, prefix + "needed-step", {
        lambdaFunction: lambdaNeeded,
        payloadResponseOnly: true
      }).next(new sfn.Choice(this, prefix + "needed-choice").when(
        sfn.Condition.booleanEquals("$.needed", true), parallel.next(moveTask)
      ).otherwise(moveTask)),
    });
    const lambdaTriggerStepFunction = new lambda.Function(this, prefix + "s3-trigger", {
      functionName: prefix + "s3-trigger",
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("resources"),
      handler: "s3-trigger.handler",
      timeout: core.Duration.minutes(2),
      environment: {
        "REGION": props.env?.region || "ap-southeast-2",
        "STATENACHINE": dataMaskingSm.stateMachineArn
      }
    });
    taskDefinition.executionRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );
    taskDefinition.executionRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess")
    );
    taskDefinition.taskRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
    );
    taskDefinition.taskRole?.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess")
    );
    for (let lambda of [lambdaNeeded, lambdaInvoke, lambdaMove, lambdaTriggerStepFunction]) {
      lambda.addLayers(helperLayer);
      bucket.grantReadWrite(lambda);
      bucket.grantDelete(lambda);
      archiveBucket.grantReadWrite(lambda);
      loaderBucket.grantDelete(lambda);
      loaderBucket.grantReadWrite(lambda);
    }
    dataMaskingSm.grantStartExecution(lambdaTriggerStepFunction);
    lambdaInvoke.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess"));
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(lambdaTriggerStepFunction))
  }
}
